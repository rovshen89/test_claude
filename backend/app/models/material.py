# backend/app/models/material.py
import uuid
from typing import Optional

from sqlalchemy import CheckConstraint, ForeignKey, JSON, Numeric, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Material(Base):
    __tablename__ = "material_catalog"
    __table_args__ = (
        CheckConstraint(
            "grain_direction IN ('horizontal','vertical','none')",
            name="ck_material_catalog_grain_direction",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("tenants.id"), nullable=True
    )  # NULL = global library
    category: Mapped[str] = mapped_column(Text, index=True)
    name: Mapped[str] = mapped_column(Text)
    sku: Mapped[str] = mapped_column(Text)
    thickness_options: Mapped[list] = mapped_column(JSON)  # e.g. [16, 18, 22]
    price_per_m2: Mapped[float] = mapped_column(Numeric)
    edgebanding_price_per_mm: Mapped[Optional[float]] = mapped_column(Numeric, nullable=True)
    s3_albedo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    s3_normal: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    s3_roughness: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    s3_ao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    grain_direction: Mapped[str] = mapped_column(Text, default="none")
