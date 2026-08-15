from datetime import datetime

from sqlalchemy import String, Text, Integer, DateTime, ForeignKey, JSON, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class ChunkEmbedding(Base):
    """One chunk of a repo file plus its embedding vector, stored as plain
    JSON. Similarity search happens in Python (see services/rag.py) rather
    than in the database, which is fine at the scale of one repo's chunks
    and avoids needing the pgvector extension."""

    __tablename__ = "chunk_embeddings"

    id: Mapped[int] = mapped_column(primary_key=True)
    repository_id: Mapped[int] = mapped_column(ForeignKey("repositories.id"))
    file_path: Mapped[str] = mapped_column(String)
    chunk_index: Mapped[int] = mapped_column(Integer)
    chunk_text: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())