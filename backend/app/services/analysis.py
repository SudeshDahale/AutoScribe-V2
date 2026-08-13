MANIFEST_TECH = {
    "package.json": "Node.js",
    "requirements.txt": "Python",
    "pyproject.toml": "Python",
    "go.mod": "Go",
    "Gemfile": "Ruby",
    "pom.xml": "Java",
    "build.gradle": "Java",
    "Cargo.toml": "Rust",
    "composer.json": "PHP",
}

EXT_LANGUAGE = {
    ".py": "Python", ".js": "JavaScript", ".jsx": "JavaScript",
    ".ts": "TypeScript", ".tsx": "TypeScript", ".go": "Go",
    ".rb": "Ruby", ".java": "Java", ".rs": "Rust", ".php": "PHP",
}

IGNORED_TOP_LEVEL = {"node_modules", "dist", "build", "venv", ".git", "__pycache__"}


def detect_tech_stack(tree: list[dict]) -> list[str]:
    names = {item["path"].split("/")[-1] for item in tree if item["type"] == "blob"}
    return sorted({tech for manifest, tech in MANIFEST_TECH.items() if manifest in names})


def detect_language_mix(tree: list[dict]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for item in tree:
        if item["type"] != "blob":
            continue
        for ext, lang in EXT_LANGUAGE.items():
            if item["path"].endswith(ext):
                counts[lang] = counts.get(lang, 0) + 1
                break
    return counts


def bucket_modules(tree: list[dict]) -> list[dict]:
    top_level: dict[str, int] = {}
    for item in tree:
        if item["type"] != "blob":
            continue
        parts = item["path"].split("/")
        if len(parts) < 2 or parts[0].startswith(".") or parts[0] in IGNORED_TOP_LEVEL:
            continue
        top_level[parts[0]] = top_level.get(parts[0], 0) + 1
    ranked = sorted(top_level.items(), key=lambda kv: -kv[1])[:8]
    return [{"name": name, "description": f"{count} files", "icon": "folder"} for name, count in ranked]