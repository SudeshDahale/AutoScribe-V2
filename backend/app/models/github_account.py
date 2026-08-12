from datetime import datetime

from sqlalchemy import String, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class GithubAccount(Base):
    __tablename__ = "github_accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    github_login: Mapped[str] = mapped_column(String)
    github_org: Mapped[str | None] = mapped_column(String, nullable=True)
    access_token_encrypted: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())