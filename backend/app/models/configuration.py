# backend/app/models/configuration.py
import uuid
from typing import Optional

from sqlalchemy import JSON, ForeignKey, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

VALID_STATUSES = {"draft", "confirmed", "in_production", "completed"}


class Configuration(Base):
    __tablename__ = "configurations"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("projects.id"))
    furniture_type_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("furniture_types.id"))
    applied_config: Mapped[dict] = mapped_column(JSON)
    placement: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(Text, default="draft")
