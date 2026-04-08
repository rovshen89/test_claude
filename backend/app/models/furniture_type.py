# backend/app/models/furniture_type.py
import uuid
from typing import Optional

from sqlalchemy import JSON, ForeignKey, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class FurnitureType(Base):
    __tablename__ = "furniture_types"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("tenants.id"), nullable=True
    )  # NULL = global template
    category: Mapped[str] = mapped_column(Text, index=True)
    schema: Mapped[dict] = mapped_column(JSON)
