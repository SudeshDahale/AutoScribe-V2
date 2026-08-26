import asyncio
from datetime import datetime, timezone
import httpx

from app.core.config import settings
from app.core.security import decrypt_token
from app.db.session import SessionLocal
<<<<<<< HEAD
from app.models import Repository, RepoSettings, GithubAccount, ActivityLog, Document
from app.services.quota import quota_manager
from app.services.agent_engine import agent_engine
from app.services.signals import (
    detect_code_signals,
    detect_api_signals,
    detect_dependency_signals,
    detect_documentation_drift,
    workflow_signal,
    caption_signals,
    store_signals,
)
=======
from app.models import Repository, RepoSettings, GithubAccount, ActivityLog
from app.services.quota import quota_manager
from app.services.agent_engine import agent_engine
>>>>>>> 71b13c417fd9639cd3e7197ada4f44e95fcbff7e

# In-memory lock set to prevent concurrent analysis runs for the same repository
_analyzing_locks: set[int] = set()

# File extensions and paths that do not require documentation regeneration
NON_CODE_EXTENSIONS = {
    ".css", ".scss", ".less", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico",
    ".woff", ".woff2", ".ttf", ".eot", ".lock", ".json", ".map", ".tmp",
}
NON_CODE_FILENAMES = {
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "Cargo.lock",
    "Gemfile.lock", "poetry.lock", "composer.lock", "go.sum", ".gitignore",
    ".prettierrc", ".eslintrc", ".editorconfig",
}


def _classify_diff_impact(files: list[dict]) -> tuple[bool, str]:
    """Inspects modified files from a commit and decides if living documentation
    needs regeneration or if changes are non-architectural (saving LLM tokens)."""
    if not files:
        return True, "Initial commit scan or manual sync"

    changed_names = [f.get("filename", "") for f in files]

    code_changes = []
    for path in changed_names:
        basename = path.rsplit("/", 1)[-1]
        ext = "." + path.rsplit(".", 1)[-1] if "." in path else ""
        if basename in NON_CODE_FILENAMES or ext in NON_CODE_EXTENSIONS:
            continue
        code_changes.append(path)

    if not code_changes:
        return False, f"Non-code changes only ({len(files)} files: styles/assets/lockfiles)"

    return True, f"Code changes detected in {len(code_changes)} files (e.g. {code_changes[0]})"


async def check_repo_commits(repo_id: int) -> dict:
    """Checks a specific repository for new commits on its tracked branch.
    Intelligently analyzes diffs and triggers autonomous doc generation when needed."""
    if repo_id in _analyzing_locks:
        return {"ok": True, "message": "Repository is already currently analyzing"}

    db = SessionLocal()
    try:
        repo = db.query(Repository).filter(Repository.id == repo_id).first()
        if not repo:
            return {"ok": False, "error": "Repository not found"}

        account = db.query(GithubAccount).filter(GithubAccount.user_id == repo.user_id).first()
        if not account:
            return {"ok": False, "error": "No GitHub account connected"}

        token = decrypt_token(account.access_token_encrypted)
        branch = repo.branch or "main"

        # Fetch latest commit on tracked branch from GitHub API
        url = f"https://api.github.com/repos/{repo.org}/{repo.name}/commits?sha={branch}&per_page=1"
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                url,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/vnd.github+json",
                    "User-Agent": "AutoScribe-Engine",
                },
            )

        if resp.status_code != 200:
            return {"ok": False, "error": f"GitHub API error: {resp.status_code}"}

        commits = resp.json()
        if not commits or not isinstance(commits, list):
            return {"ok": True, "message": "No commits found on branch"}

        latest = commits[0]
        sha = latest.get("sha", "")
        commit_data = latest.get("commit", {})
        message = (commit_data.get("message") or "").split("\n")[0][:100]
        author = commit_data.get("author", {}).get("name") or "developer"

        # Check writeback marker to avoid looping on our own commits
        from app.services.writeback import WRITEBACK_MARKER
        if WRITEBACK_MARKER in message:
            return {"ok": True, "message": "Latest commit is AutoScribe write-back (ignored)"}

        # Fetch commit detail to inspect modified files
        commit_detail_url = f"https://api.github.com/repos/{repo.org}/{repo.name}/commits/{sha}"
        async with httpx.AsyncClient(timeout=15.0) as client:
            detail_resp = await client.get(
                commit_detail_url,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/vnd.github+json",
                    "User-Agent": "AutoScribe-Engine",
                },
            )

        files = detail_resp.json().get("files", []) if detail_resp.status_code == 200 else []
        needs_analysis, rationale = _classify_diff_impact(files)

<<<<<<< HEAD
        # Category 1/2/4/5/6 signals -- detected once per commit, regardless of
        # whether this commit is code-significant enough to trigger a full
        # analysis. Rule-based detection only; the one optional LLM call
        # (caption_signals) is batched and skipped if quota isn't available.
        raw_signals = [workflow_signal("commit", sha=sha, message=message, author=author, branch=branch)]
        raw_signals += detect_code_signals(files)
        raw_signals += detect_api_signals(files)
        raw_signals += detect_dependency_signals(files)
        changed_paths = [f.get("filename", "") for f in files]
        docs_for_drift = [
            {"slug": d.slug, "title": d.title, "doc_references": d.doc_references}
            for d in db.query(Document).filter(Document.repository_id == repo.id).all()
        ]
        raw_signals += detect_documentation_drift(changed_paths, docs_for_drift)
        caption_signals(raw_signals)
        store_signals(db, repo.id, raw_signals, source_commit_sha=sha)
        db.commit()

=======
>>>>>>> 71b13c417fd9639cd3e7197ada4f44e95fcbff7e
        repo_settings = db.query(RepoSettings).filter(RepoSettings.repository_id == repo.id).first()
        auto_update = repo_settings.auto_update if repo_settings else True

        if not needs_analysis:
            # Commit is non-code (CSS, typo, lockfile). Log transparent reasoning and mark complete!
            db.add(ActivityLog(
                repository_id=repo.id,
                text=f"Commit [{sha[:7]}] by {author}: {rationale}. Living docs 100% in sync"[:180],
                type="scan",
            ))
            repo.status = "synced"
            repo.last_activity_text = f"Commit {sha[:7]} inspected: Living docs in sync"
            db.commit()
            # Emit low-signal event (marked not relevant, won't generate task)
            agent_engine.capture_event(
                source="github",
                type="scan_skipped",
                title=f"Commit {sha[:7]} — no doc impact",
                detail=rationale,
                repo_name=f"{repo.org}/{repo.name}",
            )
            return {
                "ok": True,
                "commit": sha[:7],
                "action": "skipped_no_doc_impact",
                "rationale": rationale,
            }

        # Code changes detected: trigger autonomous analysis
        db.add(ActivityLog(
            repository_id=repo.id,
            text=f"Git commit [{sha[:7]}]: {message} by {author} ({rationale})"[:180],
            type="scan",
        ))
        db.commit()
        # Emit high-signal commit event — agent will generate a task
        agent_engine.capture_event(
            source="github",
            type="commit",
            title=f"New commit: {message[:60]}",
            detail=f"{author} pushed [{sha[:7]}] — {rationale}",
            repo_name=f"{repo.org}/{repo.name}",
        )

        if auto_update and quota_manager.is_available():
            from app.api.analyze import run_analysis
            _analyzing_locks.add(repo.id)
<<<<<<< HEAD
=======
            # Emit analysis_started event to agent engine
            agent_engine.capture_event(
                source="analysis",
                type="analysis_started",
                title=f"Analysis started for {repo.org}/{repo.name}",
                detail=f"Triggered by commit {sha[:7]}: {message}",
                repo_name=f"{repo.org}/{repo.name}",
            )
>>>>>>> 71b13c417fd9639cd3e7197ada4f44e95fcbff7e
            try:
                # Run analysis in background thread with mutex protection
                def _run():
                    try:
                        run_analysis(repo.id, token)
<<<<<<< HEAD
=======
                        agent_engine.capture_event(
                            source="analysis",
                            type="analysis_complete",
                            title=f"Analysis complete for {repo.org}/{repo.name}",
                            detail="Documentation suite updated and synced.",
                            repo_name=f"{repo.org}/{repo.name}",
                        )
>>>>>>> 71b13c417fd9639cd3e7197ada4f44e95fcbff7e
                    except Exception as exc:
                        agent_engine.capture_event(
                            source="analysis",
                            type="analysis_failed",
                            title=f"Analysis failed for {repo.org}/{repo.name}",
                            detail=str(exc)[:120],
                            repo_name=f"{repo.org}/{repo.name}",
                        )
                    finally:
                        _analyzing_locks.discard(repo.id)

                asyncio.create_task(asyncio.to_thread(_run))
                return {
                    "ok": True,
                    "commit": sha[:7],
                    "message": message,
                    "author": author,
                    "action": "autonomous_analysis_started",
                }
            except Exception:
                _analyzing_locks.discard(repo.id)
                raise

        if not quota_manager.is_available():
            agent_engine.capture_event(
                source="system",
                type="quota_paused",
                title="Agent paused — API quota limit reached",
                detail="Autonomous engine will resume after cooldown.",
                repo_name=f"{repo.org}/{repo.name}",
            )

        return {
            "ok": True,
            "commit": sha[:7],
            "message": message,
            "author": author,
            "action": "logged_only" if not auto_update else "paused_for_quota",
        }

    except Exception as exc:
        return {"ok": False, "error": str(exc)}
    finally:
        db.close()


async def poll_all_repositories():
    """Loops over all connected repositories and checks them for new commits."""
    if not quota_manager.is_available():
        return

    db = SessionLocal()
    try:
        repos = db.query(Repository).all()
        for repo in repos:
            repo_settings = db.query(RepoSettings).filter(RepoSettings.repository_id == repo.id).first()
            if repo_settings and repo_settings.auto_update:
                await check_repo_commits(repo.id)
    except Exception as exc:
        print(f"[Poller] Error in poll cycle: {exc}")
    finally:
        db.close()


async def start_autonomous_poller():
    """Background task that runs periodically in the FastAPI application lifecycle."""
    print("[AutoScribe Engine] Starting autonomous commit poller background worker...")
    while True:
        try:
            await poll_all_repositories()
        except Exception as exc:
            print(f"[Poller Loop Exception] {exc}")
        await asyncio.sleep(settings.poller_interval_seconds)
