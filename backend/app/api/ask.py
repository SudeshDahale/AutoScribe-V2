import json as _json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession

from app.api.auth import get_current_user
from app.db.session import get_db
from app.models import User, Repository, ChatConversation, ChatMessage, ActivityLog, TokenUsage, Module as ModuleModel
from app.services.rag import answer_question, suggested_questions, retrieve_chunks_and_prompt
from app.services.llm import UsageTracker, get_client, _client, ANSWER_SYSTEM_PROMPT
from app.core.config import settings


router = APIRouter(prefix="/api", tags=["ask"])


def _owned_repo(repo_id: int, user: User, db: DBSession) -> Repository:
    repo = db.query(Repository).filter(Repository.id == repo_id, Repository.user_id == user.id).first()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    return repo


def _message_dict(m: ChatMessage) -> dict:
    return {
        "role": m.role,
        "text": m.text,
        "flow": m.flow or [],
        "files": m.files or [],
        "followups": m.followups or [],
    }


class AskBody(BaseModel):
    question: str


@router.get("/repos/{repo_id}/conversation")
def get_conversation(
    repo_id: int,
    conversation_id: int | None = None,
    user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    repo = _owned_repo(repo_id, user, db)
    if conversation_id is not None:
        conversation = (
            db.query(ChatConversation)
            .filter(ChatConversation.id == conversation_id, ChatConversation.repository_id == repo.id)
            .first()
        )
    else:
        conversation = (
            db.query(ChatConversation)
            .filter(ChatConversation.repository_id == repo.id)
            .order_by(ChatConversation.id.desc())
            .first()
        )
    if not conversation:
        return {"messages": [], "conversationId": None}
    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.conversation_id == conversation.id)
        .order_by(ChatMessage.id.asc())
        .all()
    )
    return {"messages": [_message_dict(m) for m in messages], "conversationId": conversation.id}


@router.post("/repos/{repo_id}/conversations")
def create_conversation(
    repo_id: int,
    user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    repo = _owned_repo(repo_id, user, db)
    conversation = ChatConversation(repository_id=repo.id)
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return {"id": conversation.id, "repository_id": repo.id, "messages": []}


@router.get("/repos/{repo_id}/conversations")
def list_conversations(
    repo_id: int,
    user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    repo = _owned_repo(repo_id, user, db)
    conversations = (
        db.query(ChatConversation)
        .filter(ChatConversation.repository_id == repo.id)
        .order_by(ChatConversation.id.desc())
        .all()
    )
    result = []
    for c in conversations:
        first_msg = (
            db.query(ChatMessage)
            .filter(ChatMessage.conversation_id == c.id)
            .order_by(ChatMessage.id.asc())
            .first()
        )
        title = first_msg.text if first_msg else "New Conversation"
        if len(title) > 40:
            title = title[:40] + "..."
        result.append({
            "id": c.id,
            "title": title,
            "created_at": c.created_at.isoformat(),
        })
    return result


@router.get("/repos/{repo_id}/suggested-questions")
def get_suggested_questions(repo_id: int, user: User = Depends(get_current_user), db: DBSession = Depends(get_db)):
    repo = _owned_repo(repo_id, user, db)
    return {"questions": suggested_questions(db, repo)}


@router.post("/repos/{repo_id}/ask")
def ask(
    repo_id: int,
    body: AskBody,
    conversation_id: int | None = None,
    user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    repo = _owned_repo(repo_id, user, db)
    question = body.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    if conversation_id is not None:
        conversation = (
            db.query(ChatConversation)
            .filter(ChatConversation.id == conversation_id, ChatConversation.repository_id == repo.id)
            .first()
        )
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
    else:
        conversation = (
            db.query(ChatConversation)
            .filter(ChatConversation.repository_id == repo.id)
            .order_by(ChatConversation.id.desc())
            .first()
        )
        if not conversation:
            conversation = ChatConversation(repository_id=repo.id)
            db.add(conversation)
            db.flush()  # need conversation.id before messages can reference it

    db.add(ChatMessage(conversation_id=conversation.id, role="user", text=question))

    with UsageTracker() as usage:
        answer = answer_question(db, repo, question)
    if usage.total_tokens > 0:
        db.add(TokenUsage(
            user_id=user.id,
            repository_id=repo.id,
            tokens=usage.total_tokens,
            kind="chat",
        ))

    db.add(ChatMessage(
        conversation_id=conversation.id,
        role="assistant",
        text=answer["text"],
        flow=answer["flow"],
        files=answer["files"],
        followups=answer["followups"],
    ))

    db.add(ActivityLog(
        repository_id=repo.id,
        text=f'Answered: "{question[:80]}"',
        type="chat",
    ))

    db.commit()
    return answer


@router.post("/repos/{repo_id}/ask/stream")
def ask_stream(
    repo_id: int,
    body: AskBody,
    conversation_id: int | None = None,
    user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """Streaming version of /ask. Emits server-sent events:
    - One `data: {"token": "..."}` line per text token as it arrives.
    - A final `data: {"done": true, "flow": [], "files": [...], "followups": [...]}` event
      carrying the structured metadata once the stream finishes.
    - `data: {"error": "..."}` on failure.

    The non-streaming /ask route is preserved for fallback compatibility.
    """
    repo = _owned_repo(repo_id, user, db)
    question = body.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    # Retrieve context chunks and build the prompt once, before opening the
    # stream, so we know which files grounded the answer without a second LLM call.
    top_chunks, prompt = retrieve_chunks_and_prompt(db, repo, question)

    files: list[dict] = []
    seen_paths: list[str] = []
    for c in top_chunks:
        if c.file_path in seen_paths:
            continue
        seen_paths.append(c.file_path)
        parts = c.file_path.split("/")
        files.append({"name": parts[-1], "path": "/".join(parts[:-1]) or "."})
    if not files:
        files = [{"name": "repo-overview", "path": f"{repo.org}/{repo.name}"}]

    def generate():
        accumulated_text = ""
        try:
            stream = _client.chat.completions.create(
                model=settings.llm_model,
                max_tokens=1024,
                messages=[
                    {"role": "system", "content": ANSWER_SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                stream=True,
            )
            for chunk in stream:
                delta = chunk.choices[0].delta if chunk.choices else None
                if delta and delta.content:
                    token = delta.content
                    accumulated_text += token
                    yield f"data: {_json.dumps({'token': token})}\n\n"

            # Build lightweight follow-ups from module names — no extra LLM call
            modules = db.query(ModuleModel).filter(ModuleModel.repository_id == repo.id).limit(3).all()
            followups = [f"How does the {m.name} module work?" for m in modules]
            if not followups:
                followups = ["What's the overall architecture?", "How do I run this?"]

            # Persist the exchange now that the full answer is accumulated
            if conversation_id is not None:
                conversation = (
                    db.query(ChatConversation)
                    .filter(ChatConversation.id == conversation_id, ChatConversation.repository_id == repo.id)
                    .first()
                )
            else:
                conversation = (
                    db.query(ChatConversation)
                    .filter(ChatConversation.repository_id == repo.id)
                    .order_by(ChatConversation.id.desc())
                    .first()
                )
            if not conversation:
                conversation = ChatConversation(repository_id=repo.id)
                db.add(conversation)
                db.flush()

            db.add(ChatMessage(conversation_id=conversation.id, role="user", text=question))
            db.add(ChatMessage(
                conversation_id=conversation.id,
                role="assistant",
                text=accumulated_text,
                flow=[],
                files=files,
                followups=followups,
            ))
            db.add(ActivityLog(
                repository_id=repo.id,
                text=f'Answered (stream): "{question[:80]}"',
                type="chat",
            ))
            db.commit()

            # Final event with structured metadata and created/used conversationId
            yield f"data: {_json.dumps({'done': True, 'conversationId': conversation.id, 'flow': [], 'files': files, 'followups': followups})}\n\n"

        except Exception as exc:
            yield f"data: {_json.dumps({'error': str(exc)})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # disable nginx response buffering for SSE
        },
    )