from sqlalchemy import String, Integer, Float, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class ArchitectureNode(Base):
    __tablename__ = "architecture_nodes"

    id: Mapped[int] = mapped_column(primary_key=True)
    analysis_id: Mapped[int] = mapped_column(ForeignKey("analyses.id"))
    node_key: Mapped[str] = mapped_column(String)  # matches mock's "id" e.g. "frontend"
    label: Mapped[str] = mapped_column(String)
    short: Mapped[str] = mapped_column(String, default="")
    type: Mapped[str] = mapped_column(String)  # client | gateway | service | data
    files: Mapped[int] = mapped_column(Integer, default=0)
    deps: Mapped[list | None] = mapped_column(JSON, nullable=True)  # tech list
    purpose: Mapped[str] = mapped_column(String, default="")
    doing: Mapped[str] = mapped_column(String, default="")
    health: Mapped[str] = mapped_column(String, default="healthy")


class ArchitectureEdge(Base):
    __tablename__ = "architecture_edges"

    id: Mapped[int] = mapped_column(primary_key=True)
    analysis_id: Mapped[int] = mapped_column(ForeignKey("analyses.id"))
    source_node_id: Mapped[int] = mapped_column(ForeignKey("architecture_nodes.id"))
    target_node_id: Mapped[int] = mapped_column(ForeignKey("architecture_nodes.id"))
    label: Mapped[str] = mapped_column(String, default="")
    traffic: Mapped[float] = mapped_column(Float, default=0.5)
    kind: Mapped[str] = mapped_column(String, default="sync")