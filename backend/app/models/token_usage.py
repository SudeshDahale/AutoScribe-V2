from datetime import datetime

from sqlalchemy import Integer, String, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class TokenUsage(Base):
    __tablename__ = "token_usage"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    repository_id: Mapped[int | None] = mapped_column(ForeignKey("repositories.id", ondelete="SET NULL"), nullable=True)
    tokens: Mapped[int] = mapped_column(Integer)
    kind: Mapped[str] = mapped_column(String)  # analysis | chat
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())