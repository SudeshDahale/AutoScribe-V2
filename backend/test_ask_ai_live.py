from app.db.session import SessionLocal
from app.models import Repository
from app.services.rag import answer_question

db = SessionLocal()
try:
    repo = db.query(Repository).filter(Repository.id == 16).first()
    print(f"Testing Ask AI for {repo.org}/{repo.name}...")

    answer_data = answer_question(db, repo, "What is the purpose of this project and what tech stack does it use?")
    print("\n[Ask AI Answer Result]")
    print(f"  Text: {answer_data.get('text')}")
    print(f"  Files Cited: {answer_data.get('files')}")
    print(f"  Follow-up suggestions: {answer_data.get('followups')}")
    print("\n-> Ask AI SUCCESS!")
except Exception as e:
    print("Ask AI test failed:", e)
finally:
    db.close()
