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
        "understandingScore": r.understanding_score,
        "docsCount": r.docs_count,
        "openPRs": r.open_prs,
        "status": r.status,
        "lastActivity": r.last_activity_text or "Queued for first analysis · now",
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
    try:
        db.delete(repo)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=(
                "Failed to disconnect repository — a database constraint prevented deletion. "
                "Run the cascade-delete migration (e1a2b3c4d5f6) and try again. "
                f"Detail: {exc.orig}"
            ),
        ) from exc
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