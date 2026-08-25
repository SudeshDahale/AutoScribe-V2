import asyncio
import json
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session as DBSession

from app.api.auth import get_current_user
from app.api.repos import _to_repo_dict
from app.db.session import SessionLocal, get_db
from app.models import User, Repository, Analysis, ActivityLog, TokenUsage
from app.services.agent_engine import agent_engine

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
            "createdAt": a.created_at.isoformat(),
        }
        for a in activity_rows
    ]

    today_utc = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    tokens_today = (
        db.query(func.coalesce(func.sum(TokenUsage.tokens), 0))
        .filter(TokenUsage.user_id == user.id, TokenUsage.created_at >= today_utc)
        .scalar()
    )

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

    from app.services.quota import quota_manager
    from app.core.config import settings
    from app.models import RepoSettings as RepoSettingsModel

    engine_status = quota_manager.get_status()

    # ── Task Board: Currently Working ────────────────────────────────────────
    # An analysis is "working" when its status is "pending" (running/in-queue).
    # We get the most recent pending analysis per repo.
    working_analyses = (
        db.query(Analysis)
        .join(Repository, Repository.id == Analysis.repository_id)
        .filter(Repository.user_id == user.id, Analysis.status.in_(["pending", "running"]))
        .order_by(Analysis.id.desc())
        .limit(5)
        .all()
    )
    working = []
    for a in working_analyses:
        r = repos_by_id.get(a.repository_id)
        if r:
            working.append({
                "repoId": str(r.id),
                "repoName": r.name,
                "org": r.org,
                "stage": "Analyzing repository...",
                "startedAt": a.created_at.isoformat() if a.created_at else None,
                "elapsedSecs": int((datetime.now(timezone.utc) - (a.created_at.replace(tzinfo=timezone.utc) if a.created_at.tzinfo is None else a.created_at)).total_seconds()) if a.created_at else 0,
            })

    # ── Task Board: Completed ─────────────────────────────────────────────────
    # Completed analysis events + PR open/update activity events
    completed_analyses = (
        db.query(Analysis)
        .join(Repository, Repository.id == Analysis.repository_id)
        .filter(Repository.user_id == user.id, Analysis.status == "synced")
        .order_by(Analysis.completed_at.desc().nullslast())
        .limit(8)
        .all()
    )
    completed = []
    for a in completed_analyses:
        r = repos_by_id.get(a.repository_id)
        if r:
            completed.append({
                "repoId": str(r.id),
                "repoName": r.name,
                "org": r.org,
                "type": "analysis",
                "label": f"Analysis complete · {r.understanding_score or 0}% understanding",
                "filesAnalyzed": a.files_analyzed or 0,
                "docsGenerated": r.docs_count or 0,
                "time": _time_ago(a.completed_at) if a.completed_at else "recently",
                "completedAt": a.completed_at.isoformat() if a.completed_at else None,
            })

    # Also include PR open activity as completed milestones
    pr_activity = [a for a in activity_rows if a.type == "pr"][:5]
    for a in pr_activity:
        r = repos_by_id.get(a.repository_id)
        if r:
            completed.append({
                "repoId": str(a.repository_id),
                "repoName": r.name,
                "org": r.org,
                "type": "pr",
                "label": a.text,
                "time": _time_ago(a.created_at),
                "completedAt": a.created_at.isoformat(),
            })

    # Sort all completed by time desc and cap
    completed.sort(key=lambda x: x.get("completedAt") or "", reverse=True)
    completed = completed[:10]

    # ── Task Board: Queued / Pending ─────────────────────────────────────────
    # Repos that are pending (never synced) + quota-paused state
    queued = []
    for r in repos:
        is_pending = r.status == "pending" and r.understanding_score == 0
        is_analyzing = r.status == "analyzing"
        repo_settings_row = db.query(RepoSettingsModel).filter(RepoSettingsModel.repository_id == r.id).first()
        auto_update = repo_settings_row.auto_update if repo_settings_row else True

        if is_pending and not is_analyzing:
            queued.append({
                "repoId": str(r.id),
                "repoName": r.name,
                "org": r.org,
                "reason": "awaiting_baseline" if auto_update else "auto_update_disabled",
                "label": "Awaiting first analysis" if auto_update else "Auto-update disabled",
            })

    # Add quota-paused state as a queued item if engine is paused
    if engine_status.get("isPaused"):
        queued.append({
            "repoId": None,
            "repoName": "All Repositories",
            "org": "",
            "reason": "quota_paused",
            "label": f"Paused: {engine_status.get('pauseReason', 'API quota limit reached')}",
            "resumesIn": engine_status.get("resumesIn"),
        })

    return {
        "repositories": [_to_repo_dict(r) for r in repos],
        "activity": activity,
        "working": working,
        "completed": completed,
        "queued": queued,
        "tokenUsage": {
            "plan": "Free",
            "provider": settings.llm_provider,
            "used": int(tokens_today or 0),
            "usedTotal": int(total_tokens or 0),
            "limit": engine_status.get("dailyLimit", FREE_PLAN_TOKEN_LIMIT),
            "resetsIn": _resets_in(),
            "isPaused": engine_status.get("isPaused", False),
            "pauseReason": engine_status.get("pauseReason"),
        },
        "engine": engine_status,
        "activeRepo": active_repo,
    }



@router.get("/activity/stream")
async def activity_stream(user: User = Depends(get_current_user)):
    """Server-Sent Events: pushes new activity_log rows for this user's repos
    as they're written, so the dashboard updates without a manual refresh.
    Polls the DB every 2s rather than LISTEN/NOTIFY -- simpler, and fast
    enough that a real analysis run (which takes several seconds of LLM
    calls anyway) never feels delayed by the poll interval.
    All DB calls are executed via run_in_threadpool so the async generator
    never blocks the event loop."""
    user_id = user.id

    async def event_generator():
        db = SessionLocal()
        try:
            def _init():
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
                return repo_ids, last_id

            repo_ids, last_id = await run_in_threadpool(_init)

            yield ": connected\n\n"  # comment line -- just opens the stream so the browser fires onopen

            while True:
                await asyncio.sleep(2)

                def _poll(last_id=last_id):
                    db.expire_all()  # otherwise SQLAlchemy's session cache would keep returning stale rows
                    r_ids = [r.id for r in db.query(Repository.id).filter(Repository.user_id == user_id).all()]
                    if not r_ids:
                        return r_ids, {}, [], last_id
                    repos_by_id = {r.id: r.name for r in db.query(Repository).filter(Repository.id.in_(r_ids)).all()}
                    new_rows = (
                        db.query(ActivityLog)
                        .filter(ActivityLog.repository_id.in_(r_ids), ActivityLog.id > last_id)
                        .order_by(ActivityLog.id.asc())
                        .all()
                    )
                    new_last_id = new_rows[-1].id if new_rows else last_id
                    return r_ids, repos_by_id, new_rows, new_last_id

                repo_ids, repos_by_id, new_rows, last_id = await run_in_threadpool(_poll)

                for row in new_rows:
                    payload = {
                        "id": row.id,
                        "repoId": str(row.repository_id) if row.repository_id else None,
                        "repo": repos_by_id.get(row.repository_id, "unknown"),
                        "text": row.text,
                        "type": row.type,
                        "time": "just now",
                        "createdAt": row.created_at.isoformat(),
                    }
                    yield f"data: {json.dumps(payload)}\n\n"
        finally:
            db.close()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ─── Agent Engine Endpoints ───────────────────────────────────────────────────

@router.get("/agent/events")
def get_agent_events(user: User = Depends(get_current_user)):
    """Returns the live event log from the in-memory agent engine."""
    return {"events": agent_engine.snapshot_events()}


@router.get("/agent/tasks")
def get_agent_tasks(user: User = Depends(get_current_user)):
    """Returns the current priority task queue."""
    return {"tasks": agent_engine.snapshot_queue()}


@router.get("/agent/execution")
def get_agent_execution(user: User = Depends(get_current_user)):
    """Returns the current (or most recent) agent execution with step-by-step progress."""
    execution = agent_engine.snapshot_execution()
    history = agent_engine.snapshot_history()
    return {"execution": execution, "history": history}