import asyncio
import json
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session as DBSession

from app.api.auth import get_current_user
from app.api.repos import _to_repo_dict
from app.db.session import SessionLocal, get_db
from app.models import User, Repository, Analysis, ActivityLog, TokenUsage

router = APIRouter(prefix="/api", tags=["dashboard"])

# Sprint 10 will enforce this; for now Sprint 9 just reports usage against it.
FREE_PLAN_TOKEN_LIMIT = 250_000


def _time_ago(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    seconds = (datetime.now(timezone.utc) - dt).total_seconds()
    if seconds < 60:
        return "just now"
    if seconds < 3600:
        return f"{int(seconds // 60)} min ago"
    if seconds < 86400:
        return f"{int(seconds // 3600)} hr ago"
    days = int(seconds // 86400)
    return "yesterday" if days == 1 else f"{days} days ago"


def _resets_in() -> str:
    """Time remaining until the next UTC midnight -- a simple daily reset
    window, good enough until real billing periods land with Sprint 10+."""
    now = datetime.now(timezone.utc)
    next_reset = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    delta = next_reset - now
    hours, remainder = divmod(int(delta.total_seconds()), 3600)
    minutes = remainder // 60
    return f"{hours}h {minutes}m"


@router.get("/dashboard")
def get_dashboard(user: User = Depends(get_current_user), db: DBSession = Depends(get_db)):
    repos = db.query(Repository).filter(Repository.user_id == user.id).order_by(Repository.id.desc()).all()
    repo_ids = [r.id for r in repos]
    repos_by_id = {r.id: r for r in repos}

    activity_rows = []
    if repo_ids:
        activity_rows = (
            db.query(ActivityLog)
            .filter(ActivityLog.repository_id.in_(repo_ids))
            .order_by(ActivityLog.id.desc())
            .limit(20)
            .all()
        )

    activity = [
        {
            "id": a.id,
            "repoId": str(a.repository_id) if a.repository_id else None,
            "repo": repos_by_id[a.repository_id].name if a.repository_id in repos_by_id else "unknown",
            "text": a.text,
            "type": a.type,
            "time": _time_ago(a.created_at),
        }
        for a in activity_rows
    ]

    total_tokens = (
        db.query(func.coalesce(func.sum(TokenUsage.tokens), 0))
        .filter(TokenUsage.user_id == user.id)
        .scalar()
    )

    active_repo = None
    latest_analysis = (
        db.query(Analysis)
        .join(Repository, Repository.id == Analysis.repository_id)
        .filter(Repository.user_id == user.id, Analysis.status == "synced")
        .order_by(Analysis.completed_at.desc())
        .first()
    )
    if latest_analysis and latest_analysis.repository_id in repos_by_id:
        r = repos_by_id[latest_analysis.repository_id]
        active_repo = {
            "name": r.name,
            "slug": str(r.id),
            "branch": r.branch,
            "understandingScore": r.understanding_score,
            "filesAnalyzed": latest_analysis.files_analyzed,
            "modulesDetected": latest_analysis.modules_detected,
            "docsSync": 100 if r.status == "synced" else 0,
            "techStack": latest_analysis.tech_stack or [],
            "architectureStyle": latest_analysis.architecture_style or [],
        }

    return {
        "repositories": [_to_repo_dict(r) for r in repos],
        "activity": activity,
        "tokenUsage": {
            "plan": "Free",
            "used": int(total_tokens or 0),
            "limit": FREE_PLAN_TOKEN_LIMIT,
            "resetsIn": _resets_in(),
        },
        "activeRepo": active_repo,
    }


@router.get("/activity/stream")
async def activity_stream(user: User = Depends(get_current_user)):
    """Server-Sent Events: pushes new activity_log rows for this user's repos
    as they're written, so the dashboard updates without a manual refresh.
    Polls the DB every 2s rather than LISTEN/NOTIFY -- simpler, and fast
    enough that a real analysis run (which takes several seconds of LLM
    calls anyway) never feels delayed by the poll interval."""
    user_id = user.id

    async def event_generator():
        db = SessionLocal()
        try:
            repo_ids = [r.id for r in db.query(Repository.id).filter(Repository.user_id == user_id).all()]
            last_id = 0
            if repo_ids:
                latest = (
                    db.query(ActivityLog.id)
                    .filter(ActivityLog.repository_id.in_(repo_ids))
                    .order_by(ActivityLog.id.desc())
                    .first()
                )
                last_id = latest[0] if latest else 0

            yield ": connected\n\n"  # comment line -- just opens the stream so the browser fires onopen

            while True:
                await asyncio.sleep(2)
                db.expire_all()  # otherwise SQLAlchemy's session cache would keep returning stale rows

                repo_ids = [r.id for r in db.query(Repository.id).filter(Repository.user_id == user_id).all()]
                if not repo_ids:
                    continue
                repos_by_id = {r.id: r.name for r in db.query(Repository).filter(Repository.id.in_(repo_ids)).all()}

                new_rows = (
                    db.query(ActivityLog)
                    .filter(ActivityLog.repository_id.in_(repo_ids), ActivityLog.id > last_id)
                    .order_by(ActivityLog.id.asc())
                    .all()
                )
                for row in new_rows:
                    last_id = row.id
                    payload = {
                        "id": row.id,
                        "repoId": str(row.repository_id) if row.repository_id else None,
                        "repo": repos_by_id.get(row.repository_id, "unknown"),
                        "text": row.text,
                        "type": row.type,
                        "time": "just now",
                    }
                    yield f"data: {json.dumps(payload)}\n\n"
        finally:
            db.close()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )