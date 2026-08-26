"""signals.py -- Detects the 7-category signal taxonomy from data AutoScribe
already fetches (commit file diffs, architecture-graph output, doc content).

Design principle (see Signal-Graph-Implementation-Plan.md): detection is diffing,
not LLM inference. The only LLM call in this whole module is caption_signals(),
which is optional, batched (one call per commit, never one per signal), and skipped
entirely when the quota manager reports the engine unavailable.
"""
from __future__ import annotations

import json
import re

CODE_EXTENSIONS = {".py", ".js", ".jsx", ".ts", ".tsx", ".go", ".rb", ".java", ".rs", ".php"}
DEPENDENCY_MANIFESTS = {"requirements.txt", "pyproject.toml", "package.json", "Cargo.toml", "go.mod", "Gemfile", "composer.json"}
CI_PREFIX = ".github/workflows/"

FUNC_DEF_RE = re.compile(r"^\s*(?:async\s+)?def\s+(\w+)\s*\(")
JS_FUNC_RE = re.compile(r"^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(")
JS_ARROW_RE = re.compile(r"^\s*(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(")
CLASS_RE = re.compile(r"^\s*(?:export\s+)?class\s+(\w+)")
PY_ROUTE_RE = re.compile(r'@(?:app|router)\.(get|post|put|patch|delete)\(\s*["\']([^"\']+)')
JS_ROUTE_RE = re.compile(r'\b(?:app|router)\.(get|post|put|patch|delete)\(\s*["\']([^"\']+)')
ENV_VAR_RE = re.compile(r"(?:os\.environ(?:\.get)?\[|process\.env\.)(\w+)")
REQ_LINE_RE = re.compile(r"^([A-Za-z0-9_\-.]+)\s*[=><~!]+=?\s*([\w.\-]+)")
PKG_JSON_LINE_RE = re.compile(r'"([A-Za-z0-9@/_\-.]+)"\s*:\s*"([\^~]?[\w.\-]+)"')
DOC_REF_RE = re.compile(r"\b[\w\-]+(?:/[\w\-.]+)*\.(?:py|js|jsx|ts|tsx|go|rb|java|rs|php|md|json|ya?ml)\b")


def _sig(category: str, subtype: str, title: str, severity: str = "info", payload: dict | None = None) -> dict:
    return {"category": category, "subtype": subtype, "title": title[:180], "severity": severity, "payload": payload}


def _patch_lines(patch: str | None) -> tuple[list[str], list[str]]:
    added, removed = [], []
    for line in (patch or "").splitlines():
        if line.startswith("+++") or line.startswith("---"):
            continue
        if line.startswith("+"):
            added.append(line[1:])
        elif line.startswith("-"):
            removed.append(line[1:])
    return added, removed


def _extract_defs(lines: list[str]) -> set[str]:
    names = set()
    for line in lines:
        for rx in (FUNC_DEF_RE, JS_FUNC_RE, JS_ARROW_RE):
            m = rx.match(line)
            if m:
                names.add(m.group(1))
                break
    return names


def _extract_classes(lines: list[str]) -> set[str]:
    names = set()
    for line in lines:
        m = CLASS_RE.match(line)
        if m:
            names.add(m.group(1))
    return names


def _extract_routes(lines: list[str]) -> set[tuple[str, str]]:
    routes = set()
    for line in lines:
        for rx in (PY_ROUTE_RE, JS_ROUTE_RE):
            m = rx.search(line)
            if m:
                routes.add((m.group(1).upper(), m.group(2)))
    return routes


def _parse_manifest_lines(basename: str, lines: list[str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in lines:
        if basename == "requirements.txt":
            m = REQ_LINE_RE.match(line.strip())
            if m:
                out[m.group(1)] = m.group(2)
        elif basename == "package.json":
            m = PKG_JSON_LINE_RE.search(line)
            if m and m.group(1) not in ("name", "version", "description"):
                out[m.group(1)] = m.group(2)
    return out


# ─── Category 1: Code Signals ──────────────────────────────────────────────

def detect_code_signals(files: list[dict]) -> list[dict]:
    """`files`: GitHub commit-detail 'files' array -- each has filename, status
    (added|removed|modified|renamed), patch (unified diff text), previous_filename."""
    signals: list[dict] = []
    for f in files:
        path = f.get("filename", "")
        status = f.get("status", "modified")
        ext = "." + path.rsplit(".", 1)[-1] if "." in path else ""
        if ext not in CODE_EXTENSIONS:
            continue  # config/infra/deps have their own categories below

        if status == "added":
            signals.append(_sig("code", "file_added", f"{path} added", payload={"path": path}))
            continue
        if status == "removed":
            signals.append(_sig("code", "file_deleted", f"{path} deleted", severity="notable", payload={"path": path}))
            continue
        if status == "renamed":
            prev = f.get("previous_filename", "")
            signals.append(_sig("code", "file_renamed", f"{prev} → {path}", payload={"from": prev, "to": path}))
            # a rename can still carry a content diff -- fall through and check the patch too

        added_lines, removed_lines = _patch_lines(f.get("patch"))
        added_funcs, removed_funcs = _extract_defs(added_lines), _extract_defs(removed_lines)
        added_classes, removed_classes = _extract_classes(added_lines), _extract_classes(removed_lines)

        new_funcs = added_funcs - removed_funcs
        deleted_funcs = removed_funcs - added_funcs
        modified_funcs = added_funcs & removed_funcs  # same name touched both sides = signature/body changed
        new_classes = added_classes - removed_classes
        deleted_classes = removed_classes - added_classes

        if new_funcs or deleted_funcs or modified_funcs or new_classes or deleted_classes:
            signals.append(_sig(
                "code", "function_changed", f"{path} modified",
                severity="notable" if (deleted_funcs or deleted_classes) else "info",
                payload={
                    "path": path,
                    "added": sorted(new_funcs), "removed": sorted(deleted_funcs), "modified": sorted(modified_funcs),
                    "classesAdded": sorted(new_classes), "classesRemoved": sorted(deleted_classes),
                },
            ))
        elif status == "modified":
            signals.append(_sig("code", "file_modified", f"{path} modified", payload={"path": path}))

        if any(("except " in l or "try:" in l or "catch" in l) for l in added_lines + removed_lines):
            signals.append(_sig("code", "error_handling_changed", f"Error handling changed in {path}", payload={"path": path}))

        env_added = {m.group(1) for l in added_lines for m in [ENV_VAR_RE.search(l)] if m}
        env_removed = {m.group(1) for l in removed_lines for m in [ENV_VAR_RE.search(l)] if m}
        if env_added or env_removed:
            signals.append(_sig(
                "code", "env_var_changed", f"Environment variables changed in {path}", severity="notable",
                payload={"path": path, "added": sorted(env_added), "removed": sorted(env_removed)},
            ))

        if "test" in path.lower() or ".spec." in path:
            signals.append(_sig("code", "test_changed", f"Test changed: {path}", payload={"path": path}))

    return signals


# ─── Category 2: API & Interface Signals ───────────────────────────────────

def detect_api_signals(files: list[dict]) -> list[dict]:
    signals: list[dict] = []
    for f in files:
        path = f.get("filename", "")
        ext = "." + path.rsplit(".", 1)[-1] if "." in path else ""
        if ext not in CODE_EXTENSIONS:
            continue
        added_lines, removed_lines = _patch_lines(f.get("patch"))
        added_routes, removed_routes = _extract_routes(added_lines), _extract_routes(removed_lines)
        for method, route in sorted(added_routes - removed_routes):
            signals.append(_sig("api", "endpoint_added", f"{method} {route} added", severity="notable",
                                 payload={"method": method, "route": route, "file": path}))
        for method, route in sorted(removed_routes - added_routes):
            signals.append(_sig("api", "endpoint_removed", f"{method} {route} removed", severity="high",
                                 payload={"method": method, "route": route, "file": path}))
    return signals


# ─── Category 4: Dependency & Infrastructure Signals ───────────────────────

def detect_dependency_signals(files: list[dict]) -> list[dict]:
    signals: list[dict] = []
    for f in files:
        path = f.get("filename", "")
        basename = path.rsplit("/", 1)[-1]
        added_lines, removed_lines = _patch_lines(f.get("patch"))

        if basename in DEPENDENCY_MANIFESTS:
            removed_pkgs = _parse_manifest_lines(basename, removed_lines)
            added_pkgs = _parse_manifest_lines(basename, added_lines)
            for name in sorted(set(added_pkgs) | set(removed_pkgs)):
                old_v, new_v = removed_pkgs.get(name), added_pkgs.get(name)
                if old_v and new_v and old_v != new_v:
                    signals.append(_sig("dependency", "dependency_version_changed", f"{name} {old_v} → {new_v}",
                                         severity="notable", payload={"name": name, "from": old_v, "to": new_v}))
                elif new_v and not old_v:
                    signals.append(_sig("dependency", "dependency_added", f"{name} {new_v} added", severity="notable",
                                         payload={"name": name, "version": new_v}))
                elif old_v and not new_v:
                    signals.append(_sig("dependency", "dependency_removed", f"{name} removed", severity="notable",
                                         payload={"name": name}))
            continue

        if basename.startswith("Dockerfile") or basename in ("docker-compose.yml", "docker-compose.yaml"):
            signals.append(_sig("dependency", "docker_config_changed", f"{basename} changed", severity="notable", payload={"path": path}))
            continue

        if path.startswith(CI_PREFIX):
            signals.append(_sig("dependency", "ci_config_changed", f"CI workflow changed: {basename}", payload={"path": path}))
            continue

        if "/alembic/versions/" in path or "/migrations/" in path:
            signals.append(_sig("dependency", "schema_migration", f"Schema migration: {basename}", severity="notable", payload={"path": path}))
            continue

    return signals


# ─── Category 3: Architecture Signals (diffed from the existing LLM output) ─

def diff_architecture(old_nodes: list[dict], new_nodes: list[dict], old_edges: list[dict], new_edges: list[dict]) -> list[dict]:
    """No new LLM call -- operates purely on the architecture-graph result
    analyze.py already computes every run, diffed against the previous synced
    Analysis's stored nodes/edges for this repository."""
    signals: list[dict] = []
    old_keys = {n["node_key"] for n in old_nodes}
    new_keys = {n["node_key"] for n in new_nodes}

    for key in new_keys - old_keys:
        label = next((n["label"] for n in new_nodes if n["node_key"] == key), key)
        signals.append(_sig("architecture", "node_added", f"{label} introduced", severity="notable", payload={"node": key}))
    for key in old_keys - new_keys:
        label = next((n["label"] for n in old_nodes if n["node_key"] == key), key)
        signals.append(_sig("architecture", "node_removed", f"{label} removed", severity="notable", payload={"node": key}))

    old_edge_keys = {(e["source_key"], e["target_key"]) for e in old_edges}
    new_edge_keys = {(e["source_key"], e["target_key"]) for e in new_edges}
    for src, tgt in new_edge_keys - old_edge_keys:
        signals.append(_sig("architecture", "dependency_added", f"{src} → {tgt} dependency added", payload={"from": src, "to": tgt}))
    for src, tgt in old_edge_keys - new_edge_keys:
        signals.append(_sig("architecture", "dependency_removed", f"{src} → {tgt} dependency removed", payload={"from": src, "to": tgt}))

    return signals


# ─── Category 5: Documentation Signals ─────────────────────────────────────

def extract_doc_references(doc_data: dict) -> list[str]:
    """Regex over the already-generated doc JSON -- no new LLM call. Recorded once
    at generation time so later commits can be checked against it cheaply."""
    text = json.dumps(doc_data)
    return sorted(set(DOC_REF_RE.findall(text)))[:50]


def detect_documentation_drift(changed_paths: list[str], documents: list[dict]) -> list[dict]:
    """`documents`: [{"slug", "title", "doc_references": [...]}]. Not necessarily a
    task -- flags that a doc *might* now be stale; the agent still decides."""
    signals: list[dict] = []
    changed_set = set(changed_paths)
    for doc in documents:
        hit = set(doc.get("doc_references") or []) & changed_set
        if hit:
            signals.append(_sig(
                "documentation", "doc_drift", f"{doc['title']} potentially stale", severity="notable",
                payload={"slug": doc["slug"], "causedBy": sorted(hit)},
            ))
    return signals


# ─── Category 6: Repository / Workflow Signals ─────────────────────────────

_WORKFLOW_TITLES = {
    "commit": lambda k: f"Commit {k.get('sha', '')[:7]}: {(k.get('message') or '')[:60]}",
    "pr_opened": lambda k: f"PR #{k.get('number')} opened: {(k.get('title') or '')[:60]}",
    "pr_updated": lambda k: f"PR #{k.get('number')} updated",
    "pr_merged": lambda k: f"PR #{k.get('number')} merged",
    "branch_created": lambda k: f"Branch {k.get('branch')} created",
    "branch_deleted": lambda k: f"Branch {k.get('branch')} deleted",
    "release_created": lambda k: f"Release {k.get('tag')} created",
    "tag_created": lambda k: f"Tag {k.get('tag')} created",
    "issue_created": lambda k: f"Issue #{k.get('number')} created",
    "issue_closed": lambda k: f"Issue #{k.get('number')} closed",
    "repo_scan_completed": lambda k: "Repository scan completed",
    "manual_sync_requested": lambda k: "Manual sync requested",
}


def workflow_signal(event_type: str, **payload) -> dict:
    title_fn = _WORKFLOW_TITLES.get(event_type, lambda k: event_type.replace("_", " ").title())
    return _sig("workflow", event_type, title_fn(payload), payload=payload)


# ─── Storage + the one batched LLM call ────────────────────────────────────

def store_signals(db, repository_id: int, raw_signals: list[dict], analysis_id: int | None = None,
                   source_commit_sha: str | None = None) -> list:
    from app.models import Signal

    if not raw_signals:
        return []
    rows = [
        Signal(
            repository_id=repository_id,
            analysis_id=analysis_id,
            category=s["category"],
            subtype=s["subtype"],
            title=s["title"],
            detail=s.get("detail"),
            payload=s.get("payload"),
            severity=s.get("severity", "info"),
            doc_impact=s.get("doc_impact"),
            source_commit_sha=source_commit_sha,
            relevant=s.get("relevant", True),
        )
        for s in raw_signals
    ]
    db.add_all(rows)
    db.flush()
    return rows


_CAPTION_SCHEMA = {
    "type": "object",
    "properties": {
        "captions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "index": {"type": "integer"},
                    "caption": {"type": "string", "description": "one short sentence explaining the change for a developer"},
                },
                "required": ["index", "caption"],
            },
        }
    },
    "required": ["captions"],
}


def caption_signals(signals: list[dict]) -> None:
    """Mutates `signals` in place, adding a `detail` caption to notable/high-severity
    api and documentation signals via ONE batched LLM call -- never one call per
    signal. No-op if there's nothing worth captioning or the engine is unavailable;
    signals already have rule-based titles, so a caption failure never loses data."""
    targets = [
        (i, s) for i, s in enumerate(signals)
        if s["category"] in ("api", "documentation") and s.get("severity") in ("notable", "high")
    ]
    if not targets:
        return

    from app.services.quota import quota_manager
    if not quota_manager.is_available():
        return

    from app.services.llm import generate_structured

    prompt = "Changes to caption:\n" + "\n".join(
        f"{i}. [{s['category']}/{s['subtype']}] {s['title']} -- payload: {json.dumps(s.get('payload') or {})[:300]}"
        for i, s in targets
    )
    try:
        result = generate_structured(
            system=(
                "You write one-sentence developer-facing captions for detected code changes. "
                "Be concrete and specific, reference real names from the payload, never invent "
                "details that aren't present."
            ),
            prompt=prompt,
            tool_name="report_captions",
            tool_description="Report a short caption for each numbered change.",
            schema=_CAPTION_SCHEMA,
        )
        for item in result.get("captions", []):
            idx = item.get("index")
            if idx is not None and 0 <= idx < len(signals):
                signals[idx]["detail"] = item.get("caption")
    except Exception:
        pass
