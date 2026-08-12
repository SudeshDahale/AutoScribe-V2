from datetime import datetime

from sqlalchemy import String, Integer, DateTime, ForeignKey, JSON, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class Analysis(Base):
    __tablename__ = "analyses"

    id: Mapped[int] = mapped_column(primary_key=True)
    repository_id: Mapped[int] = mapped_column(ForeignKey("repositories.id"))
    status: Mapped[str] = mapped_column(String, default="pending")  # pending | analyzing | synced | failed
    files_analyzed: Mapped[int] = mapped_column(Integer, default=0)
    modules_detected: Mapped[int] = mapped_column(Integer, default=0)
    external_services: Mapped[int] = mapped_column(Integer, default=0)
    tech_stack: Mapped[list | None] = mapped_column(JSON, nullable=True)
    architecture_style: Mapped[list | None] = mapped_column(JSON, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())