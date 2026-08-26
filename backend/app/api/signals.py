import asyncio
import json
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session as DBSession

from app.api.auth import get_current_user
from app.db.session import SessionLocal, get_db
from app.models import User, Repository, Signal

router = APIRouter(prefix="/api", tags=["signals"])

CATEGORIES = ["code", "api", "architecture", "dependency", "documentation", "workflow", "agent"]


def _user_repo_ids(db: DBSession, user_id: int, repo_id: int | None) -> list[int]:
    q = db.query(Repository.id).filter(Repository.user_id == user_id)
    if repo_id is not None:
        q = q.filter(Repository.id == repo_id)
    return [r.id for r in q.all()]


def _signal_dict(s: Signal, repo_name: str | None = None) -> dict:
    return {
        "id": s.id,
        "repositoryId": s.repository_id,
        "repoName": repo_name,
        "category": s.category,
        "subtype": s.subtype,
        "title": s.title,
        "detail": s.detail,
        "payload": s.payload,
        "severity": s.severity,
        "docImpact": s.doc_impact,
        "sourceCommitSha": s.source_commit_sha,
        "relevant": s.relevant,
        "createdAt": s.created_at.isoformat(),
    }


@router.get("/signals/summary")
def get_signals_summary(
    repo_id: int | None = None,
    user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """Feeds the compact dashboard widget: per-category counts (1h/24h) and the
    most recent signal in each category. Cheap enough to poll every few seconds --
    one indexed query per category, all scoped to Signal.relevant == True so
    low-signal noise (lockfile bumps, idle maintenance ticks) doesn't inflate the
    counts the graph animates against."""
    repo_ids = _user_repo_ids(db, user.id, repo_id)
    now = datetime.now(timezone.utc)
    since_1h = now - timedelta(hours=1)
    since_24h = now - timedelta(hours=24)

    categories = []
    for cat in CATEGORIES:
        if not repo_ids:
            categories.append({"category": cat, "count1h": 0, "count24h": 0, "latest": None})
            continue
        base = db.query(Signal).filter(
            Signal.repository_id.in_(repo_ids), Signal.category == cat, Signal.relevant == True
        )
        count1h = base.filter(Signal.created_at >= since_1h).count()
        count24h = base.filter(Signal.created_at >= since_24h).count()
        latest = base.order_by(Signal.id.desc()).first()
        categories.append({
            "category": cat,
            "count1h": count1h,
            "count24h": count24h,
            "latest": _signal_dict(latest) if latest else None,
        })

    return {"categories": categories, "generatedAt": now.isoformat()}


@router.get("/signals")
def list_signals(
    repo_id: int | None = None,
    category: str | None = None,
    since: str | None = None,
    cursor: int | None = None,
    limit: int = Query(default=30, le=100),
    user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """Paginated feed for the full-screen panel. `cursor` is the last-seen
    Signal.id -- pass it back to page further into history."""
    repo_ids = _user_repo_ids(db, user.id, repo_id)
    if not repo_ids:
        return {"signals": [], "nextCursor": None}

    q = db.query(Signal).filter(Signal.repository_id.in_(repo_ids))
    if category:
        q = q.filter(Signal.category == category)
    if since:
        try:
            q = q.filter(Signal.created_at >= datetime.fromisoformat(since))
        except ValueError:
            pass
    if cursor:
        q = q.filter(Signal.id < cursor)

    rows = q.order_by(Signal.id.desc()).limit(limit).all()
    repos_by_id = {r.id: f"{r.org}/{r.name}" for r in db.query(Repository).filter(Repository.id.in_(repo_ids)).all()}
    next_cursor = rows[-1].id if len(rows) == limit else None
    return {
        "signals": [_signal_dict(s, repos_by_id.get(s.repository_id)) for s in rows],
        "nextCursor": next_cursor,
    }


@router.get("/signals/stream")
async def signals_stream(user: User = Depends(get_current_user)):
    """SSE stream of new signals across the user's repos, for the graph's live
    dot animation. Same polling pattern as /api/activity/stream in dashboard.py --
    deliberately not reinvented."""
    user_id = user.id

    async def event_generator():
        db = SessionLocal()
        try:
            def _init():
                repo_ids = [r.id for r in db.query(Repository.id).filter(Repository.user_id == user_id).all()]
                last_id = 0
                if repo_ids:
                    latest = (
                        db.query(Signal.id)
                        .filter(Signal.repository_id.in_(repo_ids))
                        .order_by(Signal.id.desc())
                        .first()
                    )
                    last_id = latest[0] if latest else 0
                return repo_ids, last_id

            repo_ids, last_id = await run_in_threadpool(_init)
            yield ": connected\n\n"

            while True:
                await asyncio.sleep(2)

                def _poll(last_id=last_id):
                    db.expire_all()
                    r_ids = [r.id for r in db.query(Repository.id).filter(Repository.user_id == user_id).all()]
                    if not r_ids:
                        return r_ids, {}, [], last_id
                    repos_by_id = {r.id: f"{r.org}/{r.name}" for r in db.query(Repository).filter(Repository.id.in_(r_ids)).all()}
                    new_rows = (
                        db.query(Signal)
                        .filter(Signal.repository_id.in_(r_ids), Signal.id > last_id, Signal.relevant == True)
                        .order_by(Signal.id.asc())
                        .all()
                    )
                    new_last_id = new_rows[-1].id if new_rows else last_id
                    return r_ids, repos_by_id, new_rows, new_last_id

                repo_ids, repos_by_id, new_rows, last_id = await run_in_threadpool(_poll)

                for row in new_rows:
                    payload = _signal_dict(row, repos_by_id.get(row.repository_id))
                    yield f"data: {json.dumps(payload)}\n\n"
        finally:
            db.close()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
