# backend/app/models/user.py
import uuid
from typing import Optional

from sqlalchemy import ForeignKey, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

VALID_ROLES = {"admin", "manufacturer", "designer", "consumer"}


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("tenants.id"), nullable=True
    )  # NULL for admin (cross-tenant)
    email: Mapped[str] = mapped_column(Text, unique=True, index=True)
    role: Mapped[str] = mapped_column(Text)  # admin|manufacturer|designer|consumer
    password_hash: Mapped[str] = mapped_column(Text)
