# backend/app/models/tenant.py
import uuid
from decimal import Decimal
from typing import Optional

from sqlalchemy import JSON, Numeric, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(Text)
    margin_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0"))
    webhook_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    crm_config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
