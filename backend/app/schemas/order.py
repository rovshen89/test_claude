# backend/app/schemas/order.py
from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class OrderCreate(BaseModel):
    configuration_id: UUID


class OrderResponse(BaseModel):
    id: UUID
    configuration_id: UUID
    pricing_snapshot: dict
    bom_snapshot: dict
    export_urls: dict
    crm_ref: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}
