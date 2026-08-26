from datetime import datetime

from sqlalchemy import String, Text, Boolean, DateTime, ForeignKey, JSON, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class Signal(Base):
    """A single detected change event in one of the 7 signal categories:
    code | api | architecture | dependency | documentation | workflow | agent.

    Most rows are produced by cheap rule-based diffing (see app/services/signals.py)
    -- the LLM is only ever involved in writing the optional `detail` caption for a
    batch of already-detected signals, never in detecting them."""

    __tablename__ = "signals"

    id: Mapped[int] = mapped_column(primary_key=True)
    repository_id: Mapped[int] = mapped_column(ForeignKey("repositories.id", ondelete="CASCADE"))
    analysis_id: Mapped[int | None] = mapped_column(
        ForeignKey("analyses.id", ondelete="SET NULL"), nullable=True
    )

    category: Mapped[str] = mapped_column(String)  # code|api|architecture|dependency|documentation|workflow|agent
    subtype: Mapped[str] = mapped_column(String)  # e.g. "function_added", "endpoint_removed", "readme_drift"
    title: Mapped[str] = mapped_column(String)  # short, always rule-generated: "auth/oauth.py modified"
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)  # optional LLM caption, may be null
    payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # structured: files, before/after, impact
    severity: Mapped[str] = mapped_column(String, default="info")  # info | notable | high
    doc_impact: Mapped[list | None] = mapped_column(JSON, nullable=True)  # ["docs/api-reference.md", ...]
    source_commit_sha: Mapped[str | None] = mapped_column(String, nullable=True)
    relevant: Mapped[bool] = mapped_column(Boolean, default=True)  # low-signal noise can be stored but hidden
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
