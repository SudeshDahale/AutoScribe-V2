from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DBSession

from app.api.auth import get_current_user
from app.core.security import decrypt_token
from app.db.session import get_db
from app.models import User, GithubAccount, Repository, RepoSettings
from app.services.github import list_user_repos

router = APIRouter(prefix="/api", tags=["repos"])


def _account_token(user: User, db: DBSession) -> str:
    account = db.query(GithubAccount).filter(GithubAccount.user_id == user.id).first()
    if not account:
        raise HTTPException(status_code=400, detail="No GitHub account connected")
    return decrypt_token(account.access_token_encrypted)


@router.get("/github/repos")
async def github_repos(user: User = Depends(get_current_user), db: DBSession = Depends(get_db)):
    # _account_token is sync (DB query) — run it in the thread-pool so it
    # doesn't block the event loop while we hold the async handler open.
    token = await run_in_threadpool(_account_token, user, db)
    return await list_user_repos(token)


class ConnectRepoBody(BaseModel):
    github_repo_id: str
    name: str
    org: str
    private: bool
    language: str
    branch: str = "main"


def _to_repo_dict(r: Repository) -> dict:
    return {
        "id": str(r.id),
        "githubRepoId": r.github_repo_id,
        "name": r.name,
        "org": r.org,
        "private": r.is_private,
        "updated": "just now",
        "language": r.language,
        "branch": r.branch,
        "understandingScore": r.understanding_score or 88,
        "docsCount": r.docs_count,
        "openPRs": r.open_prs,
        "status": r.status if r.status else "synced",
        "lastActivity": r.last_activity_text or "Autonomous Sync Active · Synced with branch",
    }



@router.post("/repos")
def connect_repo(body: ConnectRepoBody, user: User = Depends(get_current_user), db: DBSession = Depends(get_db)):
    existing = (
        db.query(Repository)
        .filter(Repository.user_id == user.id, Repository.github_repo_id == body.github_repo_id)
        .first()
    )
    if existing:
        return _to_repo_dict(existing)

    repo = Repository(
        user_id=user.id,
        github_repo_id=body.github_repo_id,
        name=body.name,
        org=body.org,
        is_private=body.private,
        language=body.language,
        branch=body.branch,
        status="analyzing",
        last_activity_text="Queued for first analysis · now",
    )
    db.add(repo)
    db.flush()
    db.add(RepoSettings(repository_id=repo.id))
    db.commit()
    db.refresh(repo)
    return _to_repo_dict(repo)


@router.get("/repos")
def list_repos(user: User = Depends(get_current_user), db: DBSession = Depends(get_db)):
    repos = db.query(Repository).filter(Repository.user_id == user.id).all()
    return [_to_repo_dict(r) for r in repos]


@router.delete("/repos/{repo_id}")
def disconnect_repo(repo_id: int, user: User = Depends(get_current_user), db: DBSession = Depends(get_db)):
    repo = db.query(Repository).filter(Repository.id == repo_id, Repository.user_id == user.id).first()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    # Manually delete all child records in dependency order so no FK
    # constraint can block the deletion — works even if the cascade-delete
    # migration hasn't been applied yet.
    from app.models import (
        ActivityLog, ChunkEmbedding, ChatMessage, ChatConversation,
        DocumentVersion, Document, PullRequest, RepoSettings,
        TokenUsage, Module, ArchitectureEdge, ArchitectureNode, Analysis,
<<<<<<< HEAD
        Signal,
=======
>>>>>>> 71b13c417fd9639cd3e7197ada4f44e95fcbff7e
    )

    # Chat messages reference conversations, so delete messages first
    conv_ids = [c.id for c in db.query(ChatConversation.id).filter(ChatConversation.repository_id == repo_id).all()]
    if conv_ids:
        db.query(ChatMessage).filter(ChatMessage.conversation_id.in_(conv_ids)).delete(synchronize_session=False)
    db.query(ChatConversation).filter(ChatConversation.repository_id == repo_id).delete(synchronize_session=False)

    # Document versions reference documents
    doc_ids = [d.id for d in db.query(Document.id).filter(Document.repository_id == repo_id).all()]
    if doc_ids:
        db.query(DocumentVersion).filter(DocumentVersion.document_id.in_(doc_ids)).delete(synchronize_session=False)
    db.query(Document).filter(Document.repository_id == repo_id).delete(synchronize_session=False)

    # Architecture edges reference nodes, which reference analyses
    analysis_ids = [a.id for a in db.query(Analysis.id).filter(Analysis.repository_id == repo_id).all()]
    if analysis_ids:
        db.query(ArchitectureEdge).filter(ArchitectureEdge.analysis_id.in_(analysis_ids)).delete(synchronize_session=False)
        db.query(ArchitectureNode).filter(ArchitectureNode.analysis_id.in_(analysis_ids)).delete(synchronize_session=False)
    db.query(Analysis).filter(Analysis.repository_id == repo_id).delete(synchronize_session=False)

    # Flat children — no sub-dependencies
    db.query(ActivityLog).filter(ActivityLog.repository_id == repo_id).delete(synchronize_session=False)
    db.query(ChunkEmbedding).filter(ChunkEmbedding.repository_id == repo_id).delete(synchronize_session=False)
    db.query(PullRequest).filter(PullRequest.repository_id == repo_id).delete(synchronize_session=False)
    db.query(Module).filter(Module.repository_id == repo_id).delete(synchronize_session=False)
    db.query(TokenUsage).filter(TokenUsage.repository_id == repo_id).delete(synchronize_session=False)
<<<<<<< HEAD
    db.query(Signal).filter(Signal.repository_id == repo_id).delete(synchronize_session=False)
=======
>>>>>>> 71b13c417fd9639cd3e7197ada4f44e95fcbff7e
    db.query(RepoSettings).filter(RepoSettings.repository_id == repo_id).delete(synchronize_session=False)

    db.delete(repo)
    db.commit()
    return {"ok": True}



# ---------------------------------------------------------------------------
# Settings endpoints
# ---------------------------------------------------------------------------

class RepoSettingsPatch(BaseModel):
    auto_update: bool | None = None
    update_target: str | None = None
    branch_name: str | None = None


@router.get("/repos/{repo_id}/settings")
def get_repo_settings(repo_id: int, user: User = Depends(get_current_user), db: DBSession = Depends(get_db)):
    repo = db.query(Repository).filter(Repository.id == repo_id, Repository.user_id == user.id).first()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    settings = db.query(RepoSettings).filter(RepoSettings.repository_id == repo_id).first()
    if not settings:
        # Create default settings row if missing (shouldn't happen in normal flow)
        settings = RepoSettings(repository_id=repo_id)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return {
        "autoUpdate": settings.auto_update,
        "updateTarget": settings.update_target,
        "branchName": settings.branch_name,
    }


@router.patch("/repos/{repo_id}/settings")
def update_repo_settings(
    repo_id: int,
    body: RepoSettingsPatch,
    user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    repo = db.query(Repository).filter(Repository.id == repo_id, Repository.user_id == user.id).first()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    settings = db.query(RepoSettings).filter(RepoSettings.repository_id == repo_id).first()
    if not settings:
        settings = RepoSettings(repository_id=repo_id)
        db.add(settings)
        db.flush()

    if body.auto_update is not None:
        settings.auto_update = body.auto_update
    if body.update_target is not None:
        valid_targets = {"main", "branch", "pr"}
        if body.update_target not in valid_targets:
            raise HTTPException(status_code=422, detail=f"update_target must be one of {valid_targets}")
        settings.update_target = body.update_target
    if body.branch_name is not None:
        settings.branch_name = body.branch_name

    db.commit()
    db.refresh(settings)
    return {
        "autoUpdate": settings.auto_update,
        "updateTarget": settings.update_target,
        "branchName": settings.branch_name,
    }


# ---------------------------------------------------------------------------
# Autonomous commit sync & engine control endpoints
# ---------------------------------------------------------------------------

@router.post("/repos/{repo_id}/sync-commits")
async def sync_repo_commits(
    repo_id: int,
    user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """Manually trigger immediate commit detection and autonomous doc generation for a repo."""
    repo = db.query(Repository).filter(Repository.id == repo_id, Repository.user_id == user.id).first()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    from app.services.poller import check_repo_commits
    result = await check_repo_commits(repo_id)
    return result


@router.post("/repos/sync-all")
async def sync_all_repos(
    user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """Manually trigger commit detection across all user repos."""
    repos = db.query(Repository).filter(Repository.user_id == user.id).all()
    from app.services.poller import check_repo_commits
    results = []
    for r in repos:
        res = await check_repo_commits(r.id)
        results.append({"repo": r.name, "result": res})
    return {"ok": True, "repos": results}


class EngineToggleBody(BaseModel):
    mode: str  # active | paused | manual
    reason: str | None = None


@router.get("/engine/status")
def get_engine_status(user: User = Depends(get_current_user)):
    from app.services.quota import quota_manager
    return quota_manager.get_status()


@router.post("/engine/toggle")
def toggle_engine(
    body: EngineToggleBody,
    user: User = Depends(get_current_user),
):
    from app.services.quota import quota_manager
    if body.mode not in {"active", "paused", "manual"}:
        raise HTTPException(status_code=422, detail="mode must be one of 'active', 'paused', 'manual'")
    quota_manager.set_mode(body.mode, reason=body.reason)
    return quota_manager.get_status()