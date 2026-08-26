import json

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session as DBSession

from app.core.config import settings
from app.core.security import decrypt_token
from app.db.session import get_db
from app.models import Repository, GithubAccount, ActivityLog, Document
from app.services.github import verify_webhook_signature, get_commit_detail
from app.services.writeback import WRITEBACK_MARKER
from app.services.signals import (
    detect_code_signals,
    detect_api_signals,
    detect_dependency_signals,
    detect_documentation_drift,
    workflow_signal,
    caption_signals,
    store_signals,
)

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


@router.post("/github")
async def github_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    x_hub_signature_256: str | None = Header(default=None),
    x_github_event: str | None = Header(default=None),
    db: DBSession = Depends(get_db),
):
    raw_body = await request.body()

    if not verify_webhook_signature(settings.github_webhook_secret, raw_body, x_hub_signature_256):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    if x_github_event != "push":
        return {"ok": True, "ignored": x_github_event or "no event header"}

    payload = json.loads(raw_body)

    head_commit = payload.get("head_commit") or {}
    if WRITEBACK_MARKER in (head_commit.get("message") or ""):
        # This push is our own doc write-back landing on GitHub -- ignore it,
        # or every sync would trigger another analysis, another sync, forever.
        return {"ok": True, "ignored": "own write-back commit"}

    repo_full_name = payload.get("repository", {}).get("full_name", "")
    if "/" not in repo_full_name:
        return {"ok": True, "ignored": "no repository in payload"}
    org, name = repo_full_name.split("/", 1)

    repo = db.query(Repository).filter(Repository.org == org, Repository.name == name).first()
    if not repo:
        return {"ok": True, "ignored": "repository not connected"}

    pushed_branch = (payload.get("ref") or "").removeprefix("refs/heads/")
    if pushed_branch != repo.branch:
        return {"ok": True, "ignored": f"push to '{pushed_branch}', not tracked branch '{repo.branch}'"}

    account = db.query(GithubAccount).filter(GithubAccount.user_id == repo.user_id).first()
    if not account:
        return {"ok": True, "ignored": "no github account for repository owner"}
    token = decrypt_token(account.access_token_encrypted)

    pusher = payload.get("pusher", {}).get("name", "someone")
    db.add(ActivityLog(
        repository_id=repo.id,
        text=f"Webhook: {pusher} pushed to {repo.branch} — re-analyzing"[:180],
        type="scan",
    ))
    db.commit()

    # Same rule-based signal detection the poller applies to polled commits --
    # this keeps the graph populated for webhook-driven repos too, not just
    # polled ones. No new LLM call except the batched caption (skipped if quota
    # isn't available).
    commit_sha = head_commit.get("id", "")
    commit_detail = await get_commit_detail(token, org, name, commit_sha) if commit_sha else {}
    files = commit_detail.get("files", [])
    raw_signals = [workflow_signal(
        "commit", sha=commit_sha, message=(head_commit.get("message") or "")[:100], author=pusher, branch=repo.branch,
    )]
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
    store_signals(db, repo.id, raw_signals, source_commit_sha=commit_sha or None)
    db.commit()

    # Reuses the same pipeline as a manual "Analyze" click (Sprints 4-7). A truly
    # diff-aware re-scan that only touches changed files is a stretch goal --
    # for now every push re-runs the full analysis, which is correct, just not
    # the cheapest possible version.
    from app.api.analyze import run_analysis

    background_tasks.add_task(run_analysis, repo.id, token)
    return {"ok": True, "repository": repo_full_name, "analysis": "started"}