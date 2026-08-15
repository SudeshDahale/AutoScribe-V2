import json

from openai import OpenAI

from app.core.config import settings

_client = OpenAI(api_key=settings.llm_api_key, base_url=settings.llm_base_url)


def generate_structured(
    system: str,
    prompt: str,
    tool_name: str,
    tool_description: str,
    schema: dict,
    model: str | None = None,
) -> dict:
    """Call the LLM and force it to respond through a single tool call, so the
    result is always valid JSON matching `schema` — never free-form text you'd
    have to hope parses. Works against any OpenAI-compatible endpoint — OpenAI
    itself, Groq, or anything else that speaks this API shape — since only
    LLM_BASE_URL / LLM_API_KEY / LLM_MODEL change between providers."""
    response = _client.chat.completions.create(
        model=model or settings.llm_model,
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

    message = response.choices[0].message
    if not message.tool_calls:
        raise RuntimeError("LLM response did not include the expected tool call")

    call = message.tool_calls[0]
    return json.loads(call.function.arguments)


def generate_embeddings(texts: list[str], model: str | None = None) -> list[list[float]]:
    """Embeds a batch of texts in one API call. Returned vectors are plain
    Python lists of floats, in the same order as `texts`, so they can be
    stored as JSON and compared with plain Python/numpy later -- no vector
    database required."""
    if not texts:
        return []
    response = _client.embeddings.create(
        model=model or settings.llm_embedding_model,
        input=texts,
    )
    return [item.embedding for item in response.data]