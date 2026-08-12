from datetime import datetime

from sqlalchemy import String, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    repository_id: Mapped[int] = mapped_column(ForeignKey("repositories.id"))
    title: Mapped[str] = mapped_column(String)
    section: Mapped[str] = mapped_column(String)  # e.g. "Getting Started", "Reference"
    slug: Mapped[str] = mapped_column(String)


class DocumentVersion(Base):
    __tablename__ = "document_versions"

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id"))
    content: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String, default="Synced with code")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())