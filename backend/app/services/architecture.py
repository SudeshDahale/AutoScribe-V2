import json

from app.services.llm import generate_structured

ARCHITECTURE_TOOL_SCHEMA = {
    "type": "object",
    "properties": {
        "understanding_score": {
            "type": "integer",
            "description": "0-100: how confidently this architecture can be inferred from the evidence given",
        },
        "rationale": {"type": "string", "description": "1-2 sentences on what drove the score"},
        "tech_stack": {"type": "array", "items": {"type": "string"}},
        "architecture_style": {
            "type": "array",
            "items": {"type": "string"},
            "description": "e.g. Monolith, Microservices, Event-Driven, API-First",
        },
        "nodes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string", "description": "short slug, e.g. 'api-gateway'"},
                    "label": {"type": "string"},
                    "short": {"type": "string", "description": "1-2 word label for compact UI"},
                    "type": {"type": "string", "enum": ["client", "gateway", "service", "data"]},
                    "tech": {"type": "array", "items": {"type": "string"}},
                    "files": {"type": "integer"},
                    "purpose": {"type": "string", "description": "one sentence: what this component is for"},
                    "doing": {"type": "string", "description": "one sentence: what it does at runtime"},
                    "health": {"type": "string", "enum": ["healthy", "attention", "analyzing"]},
                },
                "required": ["id", "label", "short", "type", "tech", "files", "purpose", "doing", "health"],
            },
        },
        "edges": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "from": {"type": "string"},
                    "to": {"type": "string"},
                    "label": {"type": "string"},
                    "traffic": {"type": "number", "description": "relative importance, 0-1"},
                    "kind": {"type": "string", "enum": ["sync", "async", "read"]},
                },
                "required": ["from", "to", "label", "traffic", "kind"],
            },
        },
        "modules": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "description": {"type": "string"},
                    "icon": {
                        "type": "string",
                        "enum": ["shield", "credit-card", "package", "users", "bell", "boxes", "database", "server", "folder", "code"],
                    },
                },
                "required": ["name", "description", "icon"],
            },
        },
    },
    "required": ["understanding_score", "rationale", "tech_stack", "architecture_style", "nodes", "edges", "modules"],
}

SYSTEM_PROMPT = (
    "You are a senior software architect. You are given a compact summary of a real "
    "GitHub repository — its detected tech stack, top-level directories, and a sample "
    "of real file paths — and you infer its architecture. Only report structure you can "
    "reasonably justify from the evidence given; do not invent services, databases, or "
    "integrations the file tree doesn't suggest. If the repo is small or simple, return "
    "a small graph — even a single node — rather than padding it out to look impressive."
)


def _build_prompt(
    repo_name: str,
    tech_stack: list[str],
    language_mix: dict[str, int],
    directory_buckets: list[dict],
    sample_files: list[str],
) -> str:
    return f"""Repository: {repo_name}

Detected tech stack (from manifest files): {", ".join(tech_stack) or "none detected"}

Language mix (file counts): {json.dumps(language_mix)}

Top-level directories and file counts:
{json.dumps(directory_buckets, indent=2)}

Sample of real file paths from the tree ({len(sample_files)} shown):
{chr(10).join(sample_files)}

Based on this evidence, infer the architecture graph (nodes + edges), a short list of
functional modules with human-readable descriptions, an understanding_score (0-100)
reflecting how much of this is actually inferable from what's above (not a flat 90),
and tags for tech_stack and architecture_style."""


def generate_architecture(
    repo_name: str,
    tech_stack: list[str],
    language_mix: dict[str, int],
    directory_buckets: list[dict],
    sample_files: list[str],
) -> dict:
    prompt = _build_prompt(repo_name, tech_stack, language_mix, directory_buckets, sample_files[:150])
    return generate_structured(
        system=SYSTEM_PROMPT,
        prompt=prompt,
        tool_name="report_architecture",
        tool_description="Report the inferred architecture graph, modules, and understanding score for this repository.",
        schema=ARCHITECTURE_TOOL_SCHEMA,
    )