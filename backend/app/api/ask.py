from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession

from app.api.auth import get_current_user
from app.db.session import get_db
from app.models import User, Repository, ChatConversation, ChatMessage, ActivityLog, TokenUsage
from app.services.rag import answer_question, suggested_questions
from app.services.llm import UsageTracker

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
def get_conversation(repo_id: int, user: User = Depends(get_current_user), db: DBSession = Depends(get_db)):
    repo = _owned_repo(repo_id, user, db)
    conversation = (
        db.query(ChatConversation)
        .filter(ChatConversation.repository_id == repo.id)
        .order_by(ChatConversation.id.desc())
        .first()
    )
    if not conversation:
        return {"messages": []}
    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.conversation_id == conversation.id)
        .order_by(ChatMessage.id.asc())
        .all()
    )
    return {"messages": [_message_dict(m) for m in messages]}


@router.get("/repos/{repo_id}/suggested-questions")
def get_suggested_questions(repo_id: int, user: User = Depends(get_current_user), db: DBSession = Depends(get_db)):
    repo = _owned_repo(repo_id, user, db)
    return {"questions": suggested_questions(db, repo)}


@router.post("/repos/{repo_id}/ask")
def ask(repo_id: int, body: AskBody, user: User = Depends(get_current_user), db: DBSession = Depends(get_db)):
    repo = _owned_repo(repo_id, user, db)
    question = body.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty")

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