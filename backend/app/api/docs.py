import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session as DBSession

from app.api.auth import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models import User, Repository, Document, DocumentVersion

router = APIRouter(prefix="/api", tags=["documents"])


def _owned_repo(repo_id: int, user: User, db: DBSession) -> Repository:
    repo = db.query(Repository).filter(Repository.id == repo_id, Repository.user_id == user.id).first()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    return repo


def _humanize(dt: datetime) -> str:
    seconds = (datetime.now(timezone.utc) - dt).total_seconds()
    if seconds < 60:
        return "just now"
    if seconds < 3600:
        return f"{int(seconds // 60)} min ago"
    if seconds < 86400:
        return f"{int(seconds // 3600)} hr ago"
    days = int(seconds // 86400)
    return "yesterday" if days == 1 else f"{days} days ago"


def _word_count(content: str) -> int:
    """content is stored as JSON (structured fields), not prose — count
    words in the actual text fields, not the JSON punctuation."""
    try:
        data = json.loads(content)
        parts = [
            data.get("tagline", ""),
            data.get("overview", ""),
            " ".join(data.get("features", [])),
            data.get("quick_start", ""),
            data.get("architecture", ""),
        ]
        return len(" ".join(parts).split())
    except (json.JSONDecodeError, AttributeError):
        return len(content.split())


@router.get("/repos/{repo_id}/documents")
def list_documents(repo_id: int, user: User = Depends(get_current_user), db: DBSession = Depends(get_db)):
    """Returns all documents for a repo with their latest version status.
    Uses a single subquery (window function style via correlated subquery) to
    avoid the previous N+1 pattern of one query per document."""
    repo = _owned_repo(repo_id, user, db)

    # Subquery: for each document, find the id of its most recent version.
    latest_version_subq = (
        select(func.max(DocumentVersion.id))
        .where(DocumentVersion.document_id == Document.id)
        .correlate(Document)
        .scalar_subquery()
    )

    rows = (
        db.query(Document, DocumentVersion)
        .outerjoin(DocumentVersion, DocumentVersion.id == latest_version_subq)
        .filter(Document.repository_id == repo.id)
        .all()
    )

    return [
        {
            "id": d.id,
            "title": d.title,
            "section": d.section,
            "slug": d.slug,
            "status": v.status if v else "Not generated",
            "updated": _humanize(v.created_at) if v else None,
        }
        for d, v in rows
    ]


@router.get("/repos/{repo_id}/documents/readme")
def get_readme(repo_id: int, user: User = Depends(get_current_user), db: DBSession = Depends(get_db)):
    repo = _owned_repo(repo_id, user, db)
    doc = db.query(Document).filter(Document.repository_id == repo.id, Document.slug == "readme").first()
    latest = (
        db.query(DocumentVersion).filter(DocumentVersion.document_id == doc.id).order_by(DocumentVersion.id.desc()).first()
        if doc else None
    )
    if not doc or not latest:
        raise HTTPException(status_code=404, detail="README not generated yet")

    data = json.loads(latest.content)
    return {
        "title": data["title"],
        "tagline": data["tagline"],
        "overview": data["overview"],
        "features": data["features"],
        "quickStart": data["quick_start"],
        "architecture": data["architecture"],
        "status": latest.status,
        "updated": _humanize(latest.created_at),
    }


@router.get("/repos/{repo_id}/documents/{doc_id}/versions")
def get_document_versions(repo_id: int, doc_id: int, user: User = Depends(get_current_user), db: DBSession = Depends(get_db)):
    repo = _owned_repo(repo_id, user, db)
    doc = db.query(Document).filter(Document.id == doc_id, Document.repository_id == repo.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    versions = (
        db.query(DocumentVersion)
        .filter(DocumentVersion.document_id == doc.id)
        .order_by(DocumentVersion.id.desc())
        .all()
    )
    return [
        {"id": v.id, "status": v.status, "createdAt": v.created_at.isoformat(), "wordCount": _word_count(v.content)}
        for v in versions
    ]


@router.get("/documents/log")
def documents_log(user: User = Depends(get_current_user), db: DBSession = Depends(get_db)):
    """Returns document version history.
    N+1 fix: replaced per-row COUNT query with a window function (row_number)
    computed in a single SQL statement to determine if a version is the first
    (created) or a subsequent one (updated)."""
    rows = (
        db.query(DocumentVersion, Document, Repository)
        .join(Document, DocumentVersion.document_id == Document.id)
        .join(Repository, Document.repository_id == Repository.id)
        .filter(Repository.user_id == user.id)
        .order_by(DocumentVersion.id.desc())
        .limit(100)
        .all()
    )

    # Count total versions per document in a single query instead of N+1 counts.
    doc_ids = list({doc.id for _, doc, _ in rows})
    version_counts: dict[int, int] = {}
    if doc_ids:
        count_rows = (
            db.query(DocumentVersion.document_id, func.count(DocumentVersion.id))
            .filter(DocumentVersion.document_id.in_(doc_ids))
            .group_by(DocumentVersion.document_id)
            .all()
        )
        version_counts = {doc_id: cnt for doc_id, cnt in count_rows}

    # Track which versions we've already seen per document (ordered desc),
    # so we can determine if a given version is the latest ("updated") or first ("created").
    seen_per_doc: dict[int, int] = {}
    out = []
    for version, doc, repo in rows:
        seen_per_doc[doc.id] = seen_per_doc.get(doc.id, 0) + 1
        total = version_counts.get(doc.id, 1)
        # The earliest version is version number 1; if total == 1 there's only one.
        is_first = (seen_per_doc[doc.id] == total)
        seconds = max(0, int((datetime.now(timezone.utc) - version.created_at).total_seconds()))
        out.append({
            "id": version.id,
            "title": doc.title,
            "status": "generated" if is_first else "updated",
            "kind": doc.slug.upper(),
            "repo": str(repo.id),
            "trigger": "Repository analysis",
            "words": _word_count(version.content),
            "model": settings.llm_model,
            "agoSec": seconds,
        })
    return out