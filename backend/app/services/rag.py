import httpx
import numpy as np

from app.models.chunk import ChunkEmbedding
from app.models.module import Module
from app.services.chunking import chunk_files
from app.services.github import get_file_content_sync
from app.services.llm import generate_embeddings, generate_structured

# Kept deliberately small: each file is one GitHub API round trip, so this
# number directly controls how long the chat-indexing pass takes. 20 files
# is plenty of material for grounded answers without turning analysis into
# a multi-minute wait.
MAX_FILES_TO_CHUNK = 20
MAX_FILE_CHARS = 20_000
TEXT_EXTENSIONS = {
    ".py", ".js", ".jsx", ".ts", ".tsx", ".go", ".rb", ".java", ".rs", ".php",
    ".md", ".json", ".yml", ".yaml", ".toml", ".txt", ".html", ".css", ".sql",
}


def _is_chunkable(path: str) -> bool:
    return any(path.endswith(ext) for ext in TEXT_EXTENSIONS)


def embed_repository(db, token: str, repo, sample_files: list[str]) -> int:
    """Fetches content for a bounded set of the repo's sample files, chunks
    them, embeds every chunk, and replaces this repo's chunk rows. Returns
    the number of chunks stored. Runs as part of the background analysis
    job -- same discipline as the earlier passes: bounded input, not the
    whole repo."""
    candidate_paths = [p for p in sample_files if _is_chunkable(p)][:MAX_FILES_TO_CHUNK]

    # One shared client for the whole batch -- reuses a single TCP/TLS
    # connection across every file fetch instead of paying a fresh
    # handshake per file, which is what made this pass slow before.
    files: dict[str, str] = {}
    with httpx.Client(timeout=10.0) as client:
        for path in candidate_paths:
            content = get_file_content_sync(token, repo.org, repo.name, path, repo.branch, client=client)
            if content:
                files[path] = content[:MAX_FILE_CHARS]

    chunks = chunk_files(files)

    db.query(ChunkEmbedding).filter(ChunkEmbedding.repository_id == repo.id).delete()

    if not chunks:
        return 0

    embeddings = generate_embeddings([c["text"] for c in chunks])

    # Bulk-insert all chunk rows in one statement instead of N separate db.add()
    # calls -- the row-by-row approach was identified in the improvements plan
    # (Sprint 3.2) as meaningful overhead at realistic chunk counts.
    db.bulk_insert_mappings(
        ChunkEmbedding,
        [
            {
                "repository_id": repo.id,
                "file_path": chunk["file_path"],
                "chunk_index": chunk["chunk_index"],
                "chunk_text": chunk["text"],
                "embedding": embedding,
            }
            for chunk, embedding in zip(chunks, embeddings)
        ],
    )

    return len(chunks)


def _top_k_chunks(db, repository_id: int, query_embedding: list[float], k: int = 6) -> list[ChunkEmbedding]:
    """Cosine similarity in plain numpy over this repo's chunk rows -- a
    few hundred short vectors at most, so this is a few milliseconds of
    CPU work with no index or vector database needed."""
    rows = db.query(ChunkEmbedding).filter(ChunkEmbedding.repository_id == repository_id).all()
    if not rows:
        return []

    matrix = np.array([r.embedding for r in rows], dtype=np.float32)
    query = np.array(query_embedding, dtype=np.float32)

    norms = np.linalg.norm(matrix, axis=1) * np.linalg.norm(query)
    norms[norms == 0] = 1e-8  # avoid divide-by-zero for any degenerate vectors
    scores = matrix @ query / norms

    top_indices = np.argsort(-scores)[:k]
    return [rows[i] for i in top_indices]


ANSWER_TOOL_SCHEMA = {
    "type": "object",
    "properties": {
        "text": {
            "type": "string",
            "description": "the answer, 2-5 sentences, written for a developer reading it in a chat UI. Reference real file names inline wrapped in ** ** where relevant.",
        },
        "flow": {
            "type": "array",
            "description": "2-5 steps showing how a request or piece of data flows through the relevant files, in order. Use an empty array if there's no meaningful flow to show.",
            "items": {
                "type": "object",
                "properties": {
                    "label": {"type": "string", "description": "a real file name or component drawn from the provided excerpts"},
                    "meta": {"type": "string", "description": "a short 2-3 word tag describing its role"},
                },
                "required": ["label", "meta"],
            },
        },
        "followups": {
            "type": "array",
            "items": {"type": "string"},
            "description": "2-3 natural follow-up questions a developer might ask next",
        },
    },
    "required": ["text", "flow", "followups"],
}

ANSWER_SYSTEM_PROMPT = (
    "You are answering a developer's question about a real codebase, using only the "
    "code excerpts provided below as context. Cite real file paths from the excerpts -- "
    "never invent a file that isn't shown. If the excerpts don't contain enough to "
    "answer confidently, say so rather than guessing."
)


def _build_answer_prompt(question: str, chunks: list[ChunkEmbedding]) -> str:
    excerpts = "\n\n".join(
        f"--- {c.file_path} (chunk {c.chunk_index}) ---\n{c.chunk_text}"
        for c in chunks
    )
    return f"""Question: {question}

Code excerpts from the repository:

{excerpts}

Answer the question using only the excerpts above."""


def retrieve_chunks_and_prompt(db, repo, question: str) -> tuple[list[ChunkEmbedding], str]:
    top_chunks = []
    try:
        query_embedding = generate_embeddings([question])[0]
        top_chunks = _top_k_chunks(db, repo.id, query_embedding, k=6)
    except Exception:
        top_chunks = []

    if top_chunks:
        prompt = _build_answer_prompt(question, top_chunks)
    else:
        # Fallback to repo metadata & modules context
        modules = db.query(Module).filter(Module.repository_id == repo.id).all()
        modules_text = "\n".join(f"- {m.name}: {m.description}" for m in modules) or "Standard repo structure"
        prompt = f"""Question: {question}

Repository Context:
Repository Name: {repo.org}/{repo.name}
Language: {repo.language or 'Detected codebase'}
Modules:
{modules_text}

Answer the developer's question directly based on this repository's technical architecture."""

    return top_chunks, prompt


def answer_question(db, repo, question: str) -> dict:
    """Embeds the question, retrieves the most similar chunks for this repo,
    and asks the LLM to answer grounded in them. Fallback to repo modules
    and architecture summary if vector embeddings are empty."""
    top_chunks, prompt = retrieve_chunks_and_prompt(db, repo, question)

    result = generate_structured(
        system=ANSWER_SYSTEM_PROMPT,
        prompt=prompt,
        tool_name="report_answer",
        tool_description="Report the answer to the developer's question.",
        schema=ANSWER_TOOL_SCHEMA,
    )

    files = []
    seen_paths: list[str] = []
    for c in top_chunks:
        if c.file_path in seen_paths:
            continue
        seen_paths.append(c.file_path)
        parts = c.file_path.split("/")
        files.append({"name": parts[-1], "path": "/".join(parts[:-1]) or "."})

    if not files:
        files = [{"name": "repo-overview", "path": f"{repo.org}/{repo.name}"}]

    return {
        "text": result.get("text", f"Here is what I found about {question} in {repo.name}."),
        "flow": result.get("flow", []),
        "files": files,
        "followups": result.get("followups", ["Tell me more about the architecture", "How do I run tests?"]),
    }


def suggested_questions(db, repo) -> list[str]:
    """Lightweight, no extra LLM call: turns real module names already
    stored for this repo into concrete questions. Swap this for an LLM
    call later if you want richer suggestions once the core flow works."""
    modules = db.query(Module).filter(Module.repository_id == repo.id).all()
    questions = [f"How does the {m.name} module work?" for m in modules[:4]]
    if not questions:
        questions = ["Where is authentication implemented?", "What does this repository do?"]
    questions.append("What's the overall architecture?")
    return questions[:6]