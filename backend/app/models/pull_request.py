from datetime import datetime

from sqlalchemy import String, Integer, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class PullRequest(Base):
    __tablename__ = "pull_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    repository_id: Mapped[int] = mapped_column(ForeignKey("repositories.id", ondelete="CASCADE"))
    github_pr_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    title: Mapped[str] = mapped_column(String)
    branch: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="open")  # open | merged | closed
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())