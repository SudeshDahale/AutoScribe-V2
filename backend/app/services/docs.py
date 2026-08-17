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

API_REF_TOOL_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "overview": {"type": "string"},
        "base_url": {"type": "string"},
        "authentication": {"type": "string"},
        "endpoints": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "method": {"type": "string"},
                    "path": {"type": "string"},
                    "description": {"type": "string"},
                    "parameters": {"type": "string"},
                    "response": {"type": "string"},
                },
                "required": ["method", "path", "description"],
            },
        },
        "error_codes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "code": {"type": "string"},
                    "meaning": {"type": "string"},
                },
            },
        },
    },
    "required": ["title", "overview", "endpoints"],
}

ARCHITECTURE_TOOL_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "overview": {"type": "string"},
        "layers": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "description": {"type": "string"},
                    "technologies": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["name", "description"],
            },
        },
        "data_flow": {"type": "string"},
        "key_design_decisions": {"type": "array", "items": {"type": "string"}},
        "scalability": {"type": "string"},
    },
    "required": ["title", "overview", "layers", "data_flow"],
}

RUNBOOK_TOOL_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "prerequisites": {"type": "array", "items": {"type": "string"}},
        "environment_variables": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "description": {"type": "string"},
                    "required": {"type": "boolean"},
                },
            },
        },
        "dev_setup_steps": {"type": "array", "items": {"type": "string"}},
        "testing_commands": {"type": "string"},
        "troubleshooting": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "symptom": {"type": "string"},
                    "fix": {"type": "string"},
                },
            },
        },
    },
    "required": ["title", "prerequisites", "dev_setup_steps"],
}

SYSTEM_PROMPT = (
    "You are a principal engineer and technical writer generating accurate documentation for a real codebase. "
    "Use only the detected tech stack, architecture style, modules, and real file paths provided. "
    "Ground every section in evidence; do not invent fictional endpoints or libraries."
)


def _build_context(repo_name, tech_stack, architecture_style, modules, sample_files, reference_text: str = "", preferences: dict = None):
    modules_text = "\n".join(f"- {m['name']}: {m.get('description', '')}" for m in modules) or "none detected"
    ref_block = f"\nUser Provided Reference Document / Context:\n{reference_text.strip()}\n" if reference_text and reference_text.strip() else ""
    pref_block = f"\nUser Preferences Tone/Style: {preferences.get('tone', 'default')}\n" if preferences and isinstance(preferences, dict) else ""
    return f"""Repository: {repo_name}
Tech stack: {", ".join(tech_stack) or "none detected"}
Architecture style: {", ".join(architecture_style) or "unknown"}
{ref_block}{pref_block}
Modules detected:
{modules_text}

Sample of real file paths ({len(sample_files)} shown):
{chr(10).join(sample_files[:120])}"""


def generate_readme(repo_name, tech_stack, architecture_style, modules, sample_files, reference_text: str = "", preferences: dict = None):
    ctx = _build_context(repo_name, tech_stack, architecture_style, modules, sample_files, reference_text, preferences)
    prompt = f"""{ctx}

Write a comprehensive README for this repository: title, one-line tagline, overview, grounded features, quick-start setup commands, and architecture summary."""
    result = generate_structured(
        system=SYSTEM_PROMPT,
        prompt=prompt,
        tool_name="report_readme",
        tool_description="Report the generated README content for this repository.",
        schema=README_TOOL_SCHEMA,
    )
    result.setdefault("title", repo_name)
    result.setdefault("tagline", "")
    result.setdefault("overview", "")
    result.setdefault("features", [])
    result.setdefault("quick_start", "")
    result.setdefault("architecture", "")
    return result


def generate_api_reference(repo_name, tech_stack, architecture_style, modules, sample_files, reference_text: str = "", preferences: dict = None):
    ctx = _build_context(repo_name, tech_stack, architecture_style, modules, sample_files, reference_text, preferences)
    prompt = f"""{ctx}

Write an API Reference for this repository based on its detected routes and services. Detail the endpoints, parameter formats, response structures, and HTTP error codes."""
    result = generate_structured(
        system=SYSTEM_PROMPT,
        prompt=prompt,
        tool_name="report_api_reference",
        tool_description="Report the generated API Reference for this repository.",
        schema=API_REF_TOOL_SCHEMA,
    )
    result.setdefault("title", f"{repo_name} API Reference")
    result.setdefault("overview", "REST & RPC API documentation inferred from codebase routes.")
    result.setdefault("base_url", "http://localhost:8000/api")
    result.setdefault("authentication", "Bearer JWT Token or Session Cookie")
    result.setdefault("endpoints", [])
    result.setdefault("error_codes", [])
    return result


def generate_architecture_doc(repo_name, tech_stack, architecture_style, modules, sample_files, reference_text: str = "", preferences: dict = None):
    ctx = _build_context(repo_name, tech_stack, architecture_style, modules, sample_files, reference_text, preferences)
    prompt = f"""{ctx}

Write a detailed Technical Architecture Guide for this repository. Detail the system layers, component interactions, data pipelines, key design decisions, and scalability considerations."""
    result = generate_structured(
        system=SYSTEM_PROMPT,
        prompt=prompt,
        tool_name="report_architecture_guide",
        tool_description="Report the generated Architecture Guide for this repository.",
        schema=ARCHITECTURE_TOOL_SCHEMA,
    )
    result.setdefault("title", f"{repo_name} Architecture Guide")
    result.setdefault("overview", "Technical blueprint and component interaction guide.")
    result.setdefault("layers", [])
    result.setdefault("data_flow", "")
    result.setdefault("key_design_decisions", [])
    result.setdefault("scalability", "")
    return result


def generate_runbook(repo_name, tech_stack, architecture_style, modules, sample_files, reference_text: str = "", preferences: dict = None):
    ctx = _build_context(repo_name, tech_stack, architecture_style, modules, sample_files, reference_text, preferences)
    prompt = f"""{ctx}

Write a Developer Runbook for this repository: development setup prerequisites, environment variable configuration, local dev loop, test commands, and troubleshooting guide."""
    result = generate_structured(
        system=SYSTEM_PROMPT,
        prompt=prompt,
        tool_name="report_developer_runbook",
        tool_description="Report the generated Developer Runbook for this repository.",
        schema=RUNBOOK_TOOL_SCHEMA,
    )
    result.setdefault("title", f"{repo_name} Developer Runbook")
    result.setdefault("prerequisites", [])
    result.setdefault("environment_variables", [])
    result.setdefault("dev_setup_steps", [])
    result.setdefault("testing_commands", "")
    result.setdefault("troubleshooting", [])
    return result


# ---------------------------------------------------------------------------
# Markdown formatting helpers
# ---------------------------------------------------------------------------

def readme_to_markdown(data: dict) -> str:
    features_md = "\n".join(f"- {f}" for f in data.get("features", []))
    return f"""# {data.get('title', 'Project')}

> {data.get('tagline', '')}

## Overview
{data.get('overview', '')}

## Features
{features_md}

## Quick Start
```bash
{data.get('quick_start', '')}
```

## Architecture
{data.get('architecture', '')}
"""


def api_reference_to_markdown(data: dict) -> str:
    endpoints_md = ""
    for ep in data.get("endpoints", []):
        endpoints_md += f"""### `{ep.get('method', 'GET')}` {ep.get('path', '/')}
{ep.get('description', '')}

**Parameters / Payload:**
{ep.get('parameters', 'None')}

**Response:**
```json
{ep.get('response', '{"ok": true}')}
```

---
"""
    errors_md = "\n".join(f"| `{err.get('code')}` | {err.get('meaning')} |" for err in data.get("error_codes", []))
    if errors_md:
        errors_md = f"\n## Error Codes\n| Code | Meaning |\n| :--- | :--- |\n{errors_md}\n"

    return f"""# {data.get('title', 'API Reference')}

**Base URL:** `{data.get('base_url', 'http://localhost:8000/api')}`  
**Authentication:** {data.get('authentication', 'Bearer Token')}

## Overview
{data.get('overview', '')}

## Endpoints
{endpoints_md or "No endpoints mapped."}
{errors_md}
"""


def architecture_to_markdown(data: dict) -> str:
    layers_md = ""
    for layer in data.get("layers", []):
        tech_list = ", ".join(layer.get("technologies", []))
        layers_md += f"### {layer.get('name', 'Layer')}\n"
        if tech_list:
            layers_md += f"**Technologies:** {tech_list}\n\n"
        layers_md += f"{layer.get('description', '')}\n\n"

    decisions_md = "\n".join(f"- {d}" for d in data.get("key_design_decisions", []))

    return f"""# {data.get('title', 'Architecture Guide')}

## System Overview
{data.get('overview', '')}

## System Layers
{layers_md or "Component details."}

## Data Flow & Pipelines
{data.get('data_flow', '')}

## Key Design Decisions
{decisions_md}

## Scalability & Reliability
{data.get('scalability', '')}
"""


def runbook_to_markdown(data: dict) -> str:
    prereqs_md = "\n".join(f"- {p}" for p in data.get("prerequisites", []))
    steps_md = "\n".join(f"{i+1}. {s}" for i, s in enumerate(data.get("dev_setup_steps", [])))
    
    env_md = ""
    for env in data.get("environment_variables", []):
        req = "Required" if env.get("required") else "Optional"
        env_md += f"| `{env.get('name')}` | {req} | {env.get('description')} |\n"
    if env_md:
        env_md = f"\n## Environment Variables\n| Variable | Status | Description |\n| :--- | :--- | :--- |\n{env_md}\n"

    trouble_md = ""
    for item in data.get("troubleshooting", []):
        trouble_md += f"### {item.get('symptom')}\n**Resolution:** {item.get('fix')}\n\n"

    return f"""# {data.get('title', 'Developer Runbook')}

## Prerequisites
{prereqs_md}
{env_md}
## Local Setup & Development
{steps_md}

## Running Tests
```bash
{data.get('testing_commands', 'pytest')}
```

## Troubleshooting
{trouble_md or "No known issues reported."}
"""