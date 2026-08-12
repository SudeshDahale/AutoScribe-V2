from sqlalchemy import String, Integer, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class ArchitectureNode(Base):
    __tablename__ = "architecture_nodes"

    id: Mapped[int] = mapped_column(primary_key=True)
    analysis_id: Mapped[int] = mapped_column(ForeignKey("analyses.id"))
    node_key: Mapped[str] = mapped_column(String)  # matches mock's "id" e.g. "frontend"
    label: Mapped[str] = mapped_column(String)
    type: Mapped[str] = mapped_column(String)  # client | gateway | service | data
    files: Mapped[int] = mapped_column(Integer, default=0)
    deps: Mapped[list | None] = mapped_column(JSON, nullable=True)


class ArchitectureEdge(Base):
    __tablename__ = "architecture_edges"

    id: Mapped[int] = mapped_column(primary_key=True)
    analysis_id: Mapped[int] = mapped_column(ForeignKey("analyses.id"))
    source_node_id: Mapped[int] = mapped_column(ForeignKey("architecture_nodes.id"))
    target_node_id: Mapped[int] = mapped_column(ForeignKey("architecture_nodes.id"))