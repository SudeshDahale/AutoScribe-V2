from app.services.github import (
    commit_files_sync,
    create_pull_request_sync,
    find_open_pull_request_sync,
)

# Every write-back commit carries this marker in its message. The webhook handler
# checks for it and ignores matching pushes -- without this, our own commit would
# re-trigger the webhook, which re-runs analysis, which writes back again, forever.
WRITEBACK_MARKER = "[autoscribe-sync]"


def render_readme_markdown(readme_data: dict) -> str:
    features = "\n".join(f"- {f}" for f in readme_data.get("features", [])) or "- (none detected yet)"
    return f"""# {readme_data.get('title', 'Repository')}

{readme_data.get('tagline', '')}

## Overview

{readme_data.get('overview', '')}

## Features

{features}

## Quick Start

```bash
{readme_data.get('quick_start', 'npm install\nnpm run dev')}
```

## Architecture

{readme_data.get('architecture', '')}

---
*This file is kept in sync by [AutoScribe](https://github.com) — edits here may be overwritten on the next sync.*
"""


def write_back_docs(token: str, repo, repo_settings, readme_data: dict, extra_docs: dict[str, str] | None = None) -> dict:
    """Pushes the freshly generated living documentation suite to GitHub according to repo_settings.update_target:
      - "main"   -> commits straight to the repo's default branch
      - "branch" -> commits to a persistent named branch (no PR opened)
      - "pr"     -> commits to a doc branch and opens/updates a pull request

    Writes README.md and optionally any extra docs (e.g. docs/api-reference.md, docs/architecture.md, docs/runbook.md).
    """
    files: dict[str, str] = {"README.md": render_readme_markdown(readme_data)}

    # Add extra docs if provided
    if extra_docs:
        for doc_path, doc_content in extra_docs.items():
            files[doc_path] = doc_content

    message = f"docs: sync living documentation via AutoScribe {WRITEBACK_MARKER}"
    target = repo_settings.update_target if repo_settings else "pr"

    if target == "main":
        commit_sha = commit_files_sync(token, repo.org, repo.name, repo.branch, files, message)
        return {"mode": "main", "branch": repo.branch, "commit_sha": commit_sha, "files_written": list(files.keys())}

    if target == "branch":
        branch = repo_settings.branch_name or "docs/autoscribe"
        commit_sha = commit_files_sync(token, repo.org, repo.name, branch, files, message)
        return {"mode": "branch", "branch": branch, "commit_sha": commit_sha, "files_written": list(files.keys())}

    # target == "pr"
    branch = repo_settings.branch_name or "docs/autoscribe"
    commit_sha = commit_files_sync(token, repo.org, repo.name, branch, files, message)

    existing_pr = find_open_pull_request_sync(token, repo.org, repo.name, branch)
    if existing_pr:
        return {"mode": "pr", "branch": branch, "commit_sha": commit_sha, "pr": existing_pr, "created": False, "files_written": list(files.keys())}

    pr = create_pull_request_sync(
        token,
        repo.org,
        repo.name,
        title="docs: sync living documentation suite",
        head_branch=branch,
        base_branch=repo.branch,
        body="Opened automatically by AutoScribe autonomous engine after detecting repository changes.",
    )
    return {"mode": "pr", "branch": branch, "commit_sha": commit_sha, "pr": pr, "created": True, "files_written": list(files.keys())}