# backend/app/schemas/material.py
from decimal import Decimal
from typing import Any, List, Optional
from uuid import UUID

from pydantic import BaseModel, field_serializer


class MaterialCreate(BaseModel):
    category: str
    name: str
    sku: str
    thickness_options: List[int]
    price_per_m2: Decimal
    edgebanding_price_per_mm: Optional[Decimal] = None
    grain_direction: str = "none"
    tenant_id: Optional[UUID] = None


class MaterialUpdate(BaseModel):
    name: Optional[str] = None
    sku: Optional[str] = None
    category: Optional[str] = None
    thickness_options: Optional[List[int]] = None
    price_per_m2: Optional[Decimal] = None
    edgebanding_price_per_mm: Optional[Decimal] = None
    grain_direction: Optional[str] = None


class MaterialResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    tenant_id: Optional[UUID]
    category: str
    name: str
    sku: str
    thickness_options: List[int]
    price_per_m2: Decimal
    edgebanding_price_per_mm: Optional[Decimal]
    s3_albedo: Optional[str]
    s3_normal: Optional[str]
    s3_roughness: Optional[str]
    s3_ao: Optional[str]
    grain_direction: str

    @field_serializer("price_per_m2")
    def serialize_price(self, v: Decimal) -> float:
        return float(v)

    @field_serializer("edgebanding_price_per_mm")
    def serialize_edgebanding(self, v: Optional[Decimal]) -> Optional[float]:
        return float(v) if v is not None else None
