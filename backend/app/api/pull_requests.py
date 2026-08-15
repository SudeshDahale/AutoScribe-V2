from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DBSession

from app.api.auth import get_current_user
from app.db.session import get_db
from app.models import User, Repository, PullRequest

router = APIRouter(prefix="/api", tags=["pull-requests"])


@router.get("/pull-requests")
def list_pull_requests(user: User = Depends(get_current_user), db: DBSession = Depends(get_db)):
    repos = db.query(Repository).filter(Repository.user_id == user.id).all()
    repos_by_id = {r.id: r for r in repos}
    if not repos_by_id:
        return []

    prs = (
        db.query(PullRequest)
        .filter(PullRequest.repository_id.in_(repos_by_id.keys()))
        .order_by(PullRequest.id.desc())
        .all()
    )

    return [
        {
            "id": str(pr.id),
            "repoId": str(pr.repository_id),
            "repoName": repos_by_id[pr.repository_id].name,
            "number": pr.github_pr_number,
            "title": pr.title,
            "branch": pr.branch,
            "status": pr.status,
            "createdAt": pr.created_at.isoformat(),
        }
        for pr in prs
    ]