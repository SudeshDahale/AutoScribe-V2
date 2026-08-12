from datetime import datetime

from sqlalchemy import String, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class ActivityLog(Base):
    __tablename__ = "activity_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    repository_id: Mapped[int | None] = mapped_column(ForeignKey("repositories.id"), nullable=True)
    text: Mapped[str] = mapped_column(String)
    type: Mapped[str] = mapped_column(String)  # doc | scan | detect | pr | arch
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())