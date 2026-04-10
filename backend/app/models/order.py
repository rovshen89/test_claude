# backend/app/models/order.py
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, JSON, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Order(Base):
    __tablename__ = "orders"
    __table_args__ = (
        UniqueConstraint("configuration_id", name="uq_orders_configuration_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    configuration_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("configurations.id"), unique=True
    )
    pricing_snapshot: Mapped[dict] = mapped_column(JSON)
    bom_snapshot: Mapped[dict] = mapped_column(JSON)
    export_urls: Mapped[dict] = mapped_column(JSON, default=dict)
    crm_ref: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
