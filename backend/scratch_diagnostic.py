import os
import sys
import json
import traceback

from app.core.config import settings
from app.db.session import SessionLocal
from app.models import User, GithubAccount, Repository, RepoSettings, Analysis, Document, ArchitectureNode, ActivityLog
from app.services.llm import get_client, generate_structured, generate_embeddings
from app.core.security import decrypt_token

print("=" * 60)
print("AUTOSCRIBE COMPLETE SYSTEM DIAGNOSTIC")
print("=" * 60)
print(f"Provider: {settings.llm_provider}")
print(f"Base URL: {settings.effective_base_url}")
print(f"Model: {settings.llm_model}")
print(f"API Key present: {bool(settings.effective_api_key)} (length: {len(settings.effective_api_key)})")

# Test 1: Database connection & entity audit
db = SessionLocal()
try:
    user_count = db.query(User).count()
    repo_count = db.query(Repository).count()
    doc_count = db.query(Document).count()
    node_count = db.query(ArchitectureNode).count()
    analysis_count = db.query(Analysis).count()
    print(f"\n[Database Status]")
    print(f"  Users: {user_count}")
    print(f"  Repositories: {repo_count}")
    print(f"  Analyses: {analysis_count}")
    print(f"  Documents: {doc_count}")
    print(f"  Architecture Nodes: {node_count}")

    repos = db.query(Repository).all()
    for r in repos:
        print(f"  -> Repo ID {r.id}: {r.org}/{r.name} (status: {r.status}, score: {r.understanding_score}, docs: {r.docs_count})")
except Exception as e:
    print(f"Database Error: {e}")
    traceback.print_exc()

# Test 2: Test LLM API call with Groq
print(f"\n[Testing LLM Provider Call (Groq Llama-3.3-70b)]")
try:
    test_result = generate_structured(
        system="You are a test helper. Return JSON matching the schema.",
        prompt="Analyze this project: AutoScribe",
        tool_name="test_tool",
        tool_description="Test tool call",
        schema={
            "type": "object",
            "properties": {
                "status": {"type": "string"},
                "message": {"type": "string"},
            },
            "required": ["status", "message"],
        },
    )
    print(f"  LLM Structured Call: SUCCESS -> {test_result}")
except Exception as e:
    print(f"  LLM Structured Call FAILED: {e}")
    traceback.print_exc()

# Test 3: Test Embeddings
print(f"\n[Testing Embeddings Call / Fallback]")
try:
    vectors = generate_embeddings(["AutoScribe living documentation system", "FastAPI backend architecture"])
    print(f"  Embeddings: SUCCESS -> Generated {len(vectors)} vectors (dim: {len(vectors[0]) if vectors else 0})")
except Exception as e:
    print(f"  Embeddings FAILED: {e}")
    traceback.print_exc()

db.close()
print("\n" + "=" * 60)
