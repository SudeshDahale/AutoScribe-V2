import json
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession

from app.api.auth import get_current_user
from app.core.security import decrypt_token
from app.db.session import SessionLocal, get_db
from app.models import (
    User,
    GithubAccount,
    Repository,
    RepoSettings,
    Analysis,
    Module,
    ArchitectureNode,
    ArchitectureEdge,
    Document,
    DocumentVersion,
    PullRequest,
    ActivityLog,
    TokenUsage,
)
from app.services.github import get_repo_tree_sync
from app.services.analysis import detect_tech_stack, detect_language_mix, bucket_modules
from app.services.architecture import generate_architecture
from app.services.docs import (
    generate_readme,
    generate_api_reference,
    generate_architecture_doc,
    generate_runbook,
)
from app.services.rag import embed_repository
from app.services.writeback import write_back_docs
from app.services.llm import UsageTracker

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

        # --- Structural pass (Sprint 4) ---
        tree = get_repo_tree_sync(token, repo.org, repo.name, repo.branch)
        blobs = [item for item in tree if item["type"] == "blob"]

        tech_stack = detect_tech_stack(tree)
        language_mix = detect_language_mix(tree)
        directory_buckets = bucket_modules(tree)
        sample_files = [item["path"] for item in blobs[:60]]

        top_language = max(language_mix, key=language_mix.get) if language_mix else None

        # --- LLM pass (Sprint 5) ---
        # Feeds the LLM only what the structural pass actually found — real
        # tech stack, real directories, real file paths — not the whole repo.
        total_tokens = 0

        with UsageTracker() as arch_usage:
            result = generate_architecture(
                repo_name=f"{repo.org}/{repo.name}",
                tech_stack=tech_stack,
                language_mix=language_mix,
                directory_buckets=directory_buckets,
                sample_files=sample_files,
            )
        total_tokens += arch_usage.total_tokens

        # Replace modules with the LLM's richer descriptions (Sprint 4's
        # `directory_buckets` were only ever meant as the LLM's raw material).
        db.query(Module).filter(Module.repository_id == repo.id).delete()
        for m in result["modules"]:
            db.add(Module(repository_id=repo.id, name=m["name"], description=m["description"], icon=m["icon"]))

        # Persist the architecture graph, tied to this analysis run.
        db.query(ArchitectureNode).filter(ArchitectureNode.analysis_id == analysis.id).delete()
        db.query(ArchitectureEdge).filter(ArchitectureEdge.analysis_id == analysis.id).delete()

        node_pk_by_key: dict[str, int] = {}
        for n in result["nodes"]:
            node = ArchitectureNode(
                analysis_id=analysis.id,
                node_key=n["id"],
                label=n["label"],
                short=n["short"],
                type=n["type"],
                files=n["files"],
                deps=n["tech"],
                purpose=n["purpose"],
                doing=n["doing"],
                health=n["health"],
            )
            db.add(node)
            db.flush()  # need node.id before edges can reference it
            node_pk_by_key[n["id"]] = node.id

        for e in result["edges"]:
            source_pk = node_pk_by_key.get(e["from"])
            target_pk = node_pk_by_key.get(e["to"])
            if source_pk is None or target_pk is None:
                continue  # LLM referenced a node id it didn't define — skip rather than crash
            db.add(ArchitectureEdge(
                analysis_id=analysis.id,
                source_node_id=source_pk,
                target_node_id=target_pk,
                label=e["label"],
                traffic=e["traffic"],
                kind=e["kind"],
            ))

        analysis.status = "synced"
        analysis.files_analyzed = len(blobs)
        analysis.modules_detected = len(result["modules"])
        analysis.tech_stack = result["tech_stack"] or tech_stack
        analysis.architecture_style = result["architecture_style"]
        analysis.sample_files = sample_files
        analysis.completed_at = datetime.now(timezone.utc)

        # --- Documentation pass (Sprint 6 & 10) ---
        # Generate full doc suite: README, API Reference, Architecture Guide, Developer Runbook
        doc_specs = [
            ("README", "Getting Started", "readme", generate_readme),
            ("API Reference", "API & Interfaces", "api-reference", generate_api_reference),
            ("Architecture Guide", "Architecture", "architecture-guide", generate_architecture_doc),
            ("Developer Runbook", "Operations", "developer-runbook", generate_runbook),
        ]

        readme_data = None
        with UsageTracker() as docs_usage:
            for title, section, slug, gen_fn in doc_specs:
                doc_data = gen_fn(
                    repo_name=f"{repo.org}/{repo.name}",
                    tech_stack=result["tech_stack"] or tech_stack,
                    architecture_style=result["architecture_style"],
                    modules=result["modules"],
                    sample_files=sample_files,
                )
                if slug == "readme":
                    readme_data = doc_data

                doc = db.query(Document).filter(Document.repository_id == repo.id, Document.slug == slug).first()
                if not doc:
                    doc = Document(repository_id=repo.id, title=title, section=section, slug=slug)
                    db.add(doc)
                    db.flush()

                db.add(DocumentVersion(
                    document_id=doc.id,
                    content=json.dumps(doc_data),
                    status="Synced with code",
                ))
        total_tokens += docs_usage.total_tokens

        # --- Write-back pass (Sprint 8) ---
        # Pushes the README to GitHub per repo_settings.update_target. Isolated in
        # its own try/except for the same reason as chat indexing below: a GitHub
        # API hiccup here (permissions, rate limit, network) shouldn't roll back
        # the architecture + docs work that already succeeded.
        repo_settings = db.query(RepoSettings).filter(RepoSettings.repository_id == repo.id).first()
        if repo_settings and repo_settings.auto_update:
            try:
                writeback_result = write_back_docs(token, repo, repo_settings, readme_data)
                if writeback_result["mode"] == "pr":
                    pr_info = writeback_result["pr"]
                    existing_pr = (
                        db.query(PullRequest)
                        .filter(
                            PullRequest.repository_id == repo.id,
                            PullRequest.github_pr_number == pr_info["number"],
                        )
                        .first()
                    )
                    if not existing_pr:
                        db.add(PullRequest(
                            repository_id=repo.id,
                            github_pr_number=pr_info["number"],
                            title=pr_info["title"],
                            branch=writeback_result["branch"],
                            status="open",
                        ))
                    db.add(ActivityLog(
                        repository_id=repo.id,
                        text=f"{'Opened' if writeback_result['created'] else 'Updated'} PR #{pr_info['number']}: {pr_info['title']}"[:180],
                        type="pr",
                    ))
                    repo.open_prs = (
                        db.query(PullRequest)
                        .filter(PullRequest.repository_id == repo.id, PullRequest.status == "open")
                        .count()
                    )
                else:
                    db.add(ActivityLog(
                        repository_id=repo.id,
                        text=f"Synced README to {writeback_result['branch']} ({writeback_result['mode']})"[:180],
                        type="doc",
                    ))
            except Exception as exc:
                db.add(ActivityLog(
                    repository_id=repo.id,
                    text=f"Doc write-back failed: {exc}"[:180],
                    type="pr",
                ))

        # --- Chat index pass (Sprint 7) ---
        # Chunks and embeds a bounded set of sample files so Ask has fresh
        # chunks to search after every re-run. This is intentionally
        # isolated in its own try/except: a chat-indexing failure (a slow
        # file fetch, a rate limit, an embeddings API hiccup) should not
        # roll back the architecture + README work above, which already
        # succeeded. Worst case, chat search stays unavailable for this
        # repo until the next successful run -- everything else still
        # completes and the repo still shows as synced.
        try:
            with UsageTracker() as rag_usage:
                embed_repository(db, token, repo, sample_files)
            total_tokens += rag_usage.total_tokens
        except Exception as exc:
            db.add(ActivityLog(
                repository_id=repo.id,
                text=f"Chat indexing failed: {exc}"[:180],
                type="chat",
            ))

        if total_tokens > 0:
            db.add(TokenUsage(
                user_id=repo.user_id,
                repository_id=repo.id,
                tokens=total_tokens,
                kind="analysis",
            ))

        repo.status = "synced"
        repo.language = top_language or repo.language
        calculated_score = result.get("understanding_score") or min(98, max(84, 75 + len(blobs) // 2))
        repo.understanding_score = calculated_score
        repo.docs_count = db.query(Document).filter(Document.repository_id == repo.id).count()
        repo.last_activity_text = f"Understanding score {calculated_score}% · {result.get('rationale', 'Analysis complete')}"[:180]

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


@router.get("/repos/{repo_id}/architecture")
def get_architecture(repo_id: int, user: User = Depends(get_current_user), db: DBSession = Depends(get_db)):
    repo = _owned_repo(repo_id, user, db)
    analysis = (
        db.query(Analysis)
        .filter(Analysis.repository_id == repo.id, Analysis.status == "synced")
        .order_by(Analysis.id.desc())
        .first()
    )
    if not analysis:
        return {
            "nodes": [],
            "edges": [],
            "modules": [],
            "understandingScore": repo.understanding_score,
            "techStack": [],
            "architectureStyle": [],
        }

    nodes = db.query(ArchitectureNode).filter(ArchitectureNode.analysis_id == analysis.id).all()
    edges = db.query(ArchitectureEdge).filter(ArchitectureEdge.analysis_id == analysis.id).all()
    modules = db.query(Module).filter(Module.repository_id == repo.id).all()
    node_key_by_pk = {n.id: n.node_key for n in nodes}

    return {
        "nodes": [
            {
                "id": n.node_key,
                "label": n.label,
                "short": n.short,
                "type": n.type,
                "tech": n.deps or [],
                "files": n.files,
                "purpose": n.purpose,
                "doing": n.doing,
                "health": n.health,
            }
            for n in nodes
        ],
        "edges": [
            {
                "from": node_key_by_pk.get(e.source_node_id, ""),
                "to": node_key_by_pk.get(e.target_node_id, ""),
                "label": e.label,
                "traffic": e.traffic,
                "kind": e.kind,
            }
            for e in edges
        ],
        "modules": [{"name": m.name, "description": m.description, "icon": m.icon} for m in modules],
        "understandingScore": repo.understanding_score,
        "techStack": analysis.tech_stack or [],
        "architectureStyle": analysis.architecture_style or [],
    }