import traceback
from app.db.session import SessionLocal
from app.models import User, GithubAccount, Repository, Document, ArchitectureNode, Analysis
from app.core.security import decrypt_token
from app.api.analyze import run_analysis

db = SessionLocal()
try:
    repo = db.query(Repository).filter(Repository.id == 16).first()
    if not repo:
        repo = db.query(Repository).first()

    account = db.query(GithubAccount).filter(GithubAccount.user_id == repo.user_id).first()
    token = decrypt_token(account.access_token_encrypted)

    print(f"Triggering run_analysis for Repo ID {repo.id}: {repo.org}/{repo.name}...")
    run_analysis(repo.id, token)

    # Check resulting records in DB
    db.expire_all()
    updated_repo = db.query(Repository).filter(Repository.id == repo.id).first()
    docs = db.query(Document).filter(Document.repository_id == repo.id).all()
    nodes = db.query(ArchitectureNode).join(Analysis, Analysis.id == ArchitectureNode.analysis_id).filter(Analysis.repository_id == repo.id).all()

    print("\n[Analysis Execution Results]")
    print(f"  Repo Status: {updated_repo.status}")
    print(f"  Understanding Score: {updated_repo.understanding_score}%")
    print(f"  Documents Generated: {len(docs)}")
    for d in docs:
        print(f"    - {d.title} ({d.slug}) [{d.section}]")
    print(f"  Architecture Nodes: {len(nodes)}")
    for n in nodes[:5]:
        print(f"    - [{n.type}] {n.label}: {n.purpose}")

except Exception as e:
    print("Analysis failed:", e)
    traceback.print_exc()
finally:
    db.close()
