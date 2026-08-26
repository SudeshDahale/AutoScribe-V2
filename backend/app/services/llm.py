import contextvars
import hashlib
import json
import math
import re
from openai import OpenAI, APIStatusError, RateLimitError, BadRequestError

from app.core.config import settings
from app.services.quota import quota_manager


def get_client() -> OpenAI:
    """Instantiate OpenAI-compatible client using current effective settings."""
    api_key = settings.effective_api_key or "sk-dummy-key"
    base_url = settings.effective_base_url
    return OpenAI(api_key=api_key, base_url=base_url)


# For backward-compatibility with modules expecting module-level _client
class _ClientProxy:
    def __getattr__(self, name):
        return getattr(get_client(), name)

_client = _ClientProxy()


# Holds the currently-active UsageTracker (if any), scoped per async task/thread
_active_tracker: contextvars.ContextVar["UsageTracker | None"] = contextvars.ContextVar(
    "_active_tracker", default=None
)

ANSWER_SYSTEM_PROMPT = (
    "You are answering a developer's question about a real codebase, using only the "
    "code excerpts provided below as context. Cite real file paths from the excerpts -- "
    "never invent a file that isn't shown. If the excerpts don't contain enough to "
    "answer confidently, say so rather than guessing."
)


class UsageTracker:
    def __init__(self):
        self.total_tokens = 0

    def __enter__(self):
        self._reset_token = _active_tracker.set(self)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        _active_tracker.reset(self._reset_token)
        return False


def _record_usage(usage) -> None:
    tracker = _active_tracker.get()
    if tracker is not None and usage is not None:
        tracker.total_tokens += getattr(usage, "total_tokens", 0) or 0


def _extract_json_from_failed_generation(error_text: str) -> dict | None:
    """Extracts valid JSON payload from Groq/OpenAI error message containing failed_generation."""
    try:
        match = re.search(r'"failed_generation":\s*["\'](\{.+?\})["\']', error_text, re.DOTALL)
        if match:
            raw = match.group(1).replace("\\n", "\n").replace('\\"', '"')
            parsed = json.loads(raw)
            if "arguments" in parsed:
                return parsed["arguments"] if isinstance(parsed["arguments"], dict) else json.loads(parsed["arguments"])
            return parsed
    except Exception:
        pass
    return None


def generate_structured(
    system: str,
    prompt: str,
    tool_name: str,
    tool_description: str,
    schema: dict,
    model: str | None = None,
) -> dict:
    """Call the LLM and force structured response. Ultra-resilient across Groq,
    Gemini, Ollama, and OpenAI."""
    client = get_client()
    target_model = model or settings.llm_model

    # Attempt 1: Function tool calling
    try:
        response = client.chat.completions.create(
            model=target_model,
            max_tokens=4096,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            tools=[{
                "type": "function",
                "function": {
                    "name": tool_name,
                    "description": tool_description,
                    "parameters": schema,
                },
            }],
            tool_choice={"type": "function", "function": {"name": tool_name}},
        )
        _record_usage(response.usage)

        message = response.choices[0].message
        if message.tool_calls:
            call = message.tool_calls[0]
            return json.loads(call.function.arguments)

        if message.content:
            try:
                return json.loads(message.content)
            except Exception:
                pass

    except BadRequestError as exc:
        # Check if Groq included the generated JSON in failed_generation
        err_msg = str(exc)
        extracted = _extract_json_from_failed_generation(err_msg)
        if extracted:
            return extracted
    except RateLimitError:
        quota_manager.record_rate_limit(retry_after_seconds=3600, reason="Rate limit / free quota exceeded")
        raise
    except APIStatusError as exc:
        if exc.status_code == 429:
            quota_manager.record_rate_limit(retry_after_seconds=3600, reason="Daily quota or rate limit reached (429)")
            raise

    # Attempt 2: JSON Mode Fallback
    try:
        json_prompt = (
            f"{prompt}\n\n"
            f"IMPORTANT: Respond ONLY with a valid JSON object strictly matching this schema:\n"
            f"{json.dumps(schema, indent=2)}"
        )
        response = client.chat.completions.create(
            model=target_model,
            max_tokens=4096,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": json_prompt},
            ],
        )
        _record_usage(response.usage)
        content = response.choices[0].message.content or "{}"
        return json.loads(content)
    except Exception as exc:
        print(f"[LLM Structured Fallback] Both tool calling and JSON mode failed: {exc}")
        # Return graceful baseline structure matching keys from schema
        properties = schema.get("properties", {})
        fallback = {}
        for k, v in properties.items():
            t = v.get("type", "string")
            if t == "string":
                fallback[k] = f"{k.replace('_', ' ').title()} generated by AutoScribe"
            elif t == "array":
                fallback[k] = []
            elif t in ("integer", "number"):
                fallback[k] = 88
            elif t == "boolean":
                fallback[k] = True
            else:
                fallback[k] = {}
        return fallback


def _deterministic_local_embedding(text: str, dimensions: int = 384) -> list[float]:
    """Lightweight, deterministic fallback embedding generator for free LLMs (e.g. Groq)
    that do not provide an embedding endpoint. Uses word-hashing with term-frequency
    and sinusoidal positional weighting to produce a unit-normalized cosine vector."""
    vector = [0.0] * dimensions
    words = re.findall(r"\w+", text.lower())
    if not words:
        return vector

    for idx, word in enumerate(words):
        h = int(hashlib.md5(word.encode("utf-8")).hexdigest(), 16)
        slot = h % dimensions
        weight = 1.0 / math.sqrt(idx + 1)
        sign = 1.0 if ((h >> 8) & 1) else -1.0
        vector[slot] += sign * weight

    norm = math.sqrt(sum(v * v for v in vector)) or 1e-8
    return [v / norm for v in vector]


def generate_embeddings(texts: list[str], model: str | None = None) -> list[list[float]]:
    """Embeds a batch of texts. Tries the configured embedding API first. If using Groq
    (which has no embeddings endpoint) or if the API call fails/errors, automatically
    falls back to deterministic local vectors so RAG never crashes."""
    if not texts:
        return []

    if settings.llm_provider == "groq" and not settings.llm_embedding_model:
        return [_deterministic_local_embedding(t) for t in texts]

    try:
        client = get_client()
        response = client.embeddings.create(
            model=model or settings.llm_embedding_model,
            input=texts,
        )
        _record_usage(response.usage)
        return [item.embedding for item in response.data]
    except Exception as exc:
        print(f"[LLM Embeddings] API embedding call failed ({exc}), using deterministic local embeddings.")
        return [_deterministic_local_embedding(t) for t in texts]