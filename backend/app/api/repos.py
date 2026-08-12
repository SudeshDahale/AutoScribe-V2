from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
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
    token = _account_token(user, db)
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
    db.delete(repo)
    db.commit()
    return {"ok": True}