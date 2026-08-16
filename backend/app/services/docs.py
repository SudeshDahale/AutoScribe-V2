from app.services.llm import generate_structured

README_TOOL_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "tagline": {"type": "string", "description": "one sentence describing what this project does"},
        "overview": {"type": "string", "description": "2-4 sentence overview of the project's purpose and how it's put together"},
        "features": {"type": "array", "items": {"type": "string"}, "description": "concrete, grounded feature bullets"},
        "quick_start": {"type": "string", "description": "shell commands to clone, install and run the project, based on the detected tech stack"},
        "architecture": {"type": "string", "description": "2-3 sentences on how the major pieces fit together"},
    },
    "required": ["title", "tagline", "overview", "features", "quick_start", "architecture"],
}

SYSTEM_PROMPT = (
    "You are a technical writer generating a README for a real GitHub repository. You are "
    "given its detected tech stack, top-level directories, and a sample of real file paths. "
    "Write concrete, grounded content based only on this evidence — do not invent features, "
    "frameworks, or setup steps the evidence doesn't support. If something is unclear, keep "
    "that section general rather than fabricating specifics."
)


def _build_prompt(repo_name, tech_stack, architecture_style, modules, sample_files):
    modules_text = "\n".join(f"- {m['name']}: {m['description']}" for m in modules) or "none detected"
    return f"""Repository: {repo_name}

Tech stack: {", ".join(tech_stack) or "none detected"}
Architecture style: {", ".join(architecture_style) or "unknown"}

Modules detected:
{modules_text}

Sample of real file paths ({len(sample_files)} shown):
{chr(10).join(sample_files)}

Write a README for this repository: title, one-line tagline, a short overview, a features
list grounded in what's actually there, quick-start shell commands matching the detected
tech stack, and a short architecture summary."""


def generate_readme(repo_name, tech_stack, architecture_style, modules, sample_files):
    prompt = _build_prompt(repo_name, tech_stack, architecture_style, modules, sample_files[:100])
    result = generate_structured(
        system=SYSTEM_PROMPT,
        prompt=prompt,
        tool_name="report_readme",
        tool_description="Report the generated README content for this repository.",
        schema=README_TOOL_SCHEMA,
    )

    # Same defensive backfill as architecture.py: not every OpenAI-compatible
    # provider actually enforces the tool schema's "required" list, so a
    # missing key here shouldn't KeyError deep in write-back's markdown render.
    result.setdefault("title", repo_name)
    result.setdefault("tagline", "")
    result.setdefault("overview", "")
    result.setdefault("features", [])
    result.setdefault("quick_start", "")
    result.setdefault("architecture", "")
    return result