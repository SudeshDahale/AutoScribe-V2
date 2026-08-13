from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession

from app.api.auth import get_current_user
from app.core.security import decrypt_token
from app.db.session import SessionLocal, get_db
from app.models import User, GithubAccount, Repository, Analysis, Module
from app.services.github import get_repo_tree_sync
from app.services.analysis import detect_tech_stack, detect_language_mix, bucket_modules

router = APIRouter(prefix="/api", tags=["analysis"])


def _owned_repo(repo_id: int, user: User, db: DBSession) -> Repository:
    repo = db.query(Repository).filter(Repository.id == repo_id, Repository.user_id == user.id).first()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    return repo


def run_analysis(repo_id: int, token: str):
    """Runs in a background thread, after the HTTP response has already been sent.
    Opens its own DB session — it can't reuse the request's, which closes as
    soon as the request finishes."""
    db = SessionLocal()
    try:
        repo = db.query(Repository).filter(Repository.id == repo_id).first()
        if not repo:
            return

        analysis = Analysis(repository_id=repo.id, status="analyzing")
        db.add(analysis)
        repo.status = "analyzing"
        db.commit()
        db.refresh(analysis)

        tree = get_repo_tree_sync(token, repo.org, repo.name, repo.branch)
        blobs = [item for item in tree if item["type"] == "blob"]

        tech_stack = detect_tech_stack(tree)
        language_mix = detect_language_mix(tree)
        modules = bucket_modules(tree)

        db.query(Module).filter(Module.repository_id == repo.id).delete()
        for m in modules:
            db.add(Module(repository_id=repo.id, name=m["name"], description=m["description"], icon=m["icon"]))

        top_language = max(language_mix, key=language_mix.get) if language_mix else None

        analysis.status = "synced"
        analysis.files_analyzed = len(blobs)
        analysis.modules_detected = len(modules)
        analysis.tech_stack = tech_stack
        analysis.architecture_style = []  # filled in by Sprint 5's LLM pass
        analysis.sample_files = [item["path"] for item in blobs[:60]]
        analysis.completed_at = datetime.now(timezone.utc)

        repo.status = "synced"
        repo.language = top_language or repo.language
        repo.last_activity_text = f"Analyzed {len(blobs)} files · just now"

        db.commit()
    except Exception:
        db.rollback()
        failed = (
            db.query(Analysis)
            .filter(Analysis.repository_id == repo_id)
            .order_by(Analysis.id.desc())
            .first()
        )
        if failed:
            failed.status = "failed"
        broken_repo = db.query(Repository).filter(Repository.id == repo_id).first()
        if broken_repo:
            broken_repo.status = "pending"
        db.commit()
        raise
    finally:
        db.close()


@router.post("/repos/{repo_id}/analyze")
def start_analysis(
    repo_id: int,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    repo = _owned_repo(repo_id, user, db)
    account = db.query(GithubAccount).filter(GithubAccount.user_id == user.id).first()
    if not account:
        raise HTTPException(status_code=400, detail="No GitHub account connected")
    token = decrypt_token(account.access_token_encrypted)

    background_tasks.add_task(run_analysis, repo.id, token)
    return {"status": "started"}


@router.get("/repos/{repo_id}/analysis")
def get_analysis(repo_id: int, user: User = Depends(get_current_user), db: DBSession = Depends(get_db)):
    repo = _owned_repo(repo_id, user, db)
    analysis = (
        db.query(Analysis)
        .filter(Analysis.repository_id == repo.id)
        .order_by(Analysis.id.desc())
        .first()
    )
    if not analysis:
        return {"status": "pending", "filesAnalyzed": 0, "modulesDetected": 0, "techStack": []}
    return {
        "status": analysis.status,
        "filesAnalyzed": analysis.files_analyzed,
        "modulesDetected": analysis.modules_detected,
        "techStack": analysis.tech_stack or [],
        "sampleFiles": analysis.sample_files or [],
    }