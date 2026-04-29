# backend/app/schemas/tenant.py
from decimal import Decimal
from typing import Any, Dict, Optional
from uuid import UUID

from pydantic import BaseModel, field_serializer


class TenantResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    name: str
    margin_pct: Decimal
    webhook_url: Optional[str] = None
    crm_config: Optional[Dict[str, Any]] = None

    @field_serializer("margin_pct")
    def serialize_margin(self, v: Decimal) -> float:
        return float(v)


class TenantUpdate(BaseModel):
    name: Optional[str] = None
    margin_pct: Optional[Decimal] = None
    webhook_url: Optional[str] = None
    crm_config: Optional[Dict[str, Any]] = None
