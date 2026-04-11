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
    crm_ref: Optional[str] = None
    last_dispatch: Optional[dict] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class DispatchResponse(BaseModel):
    order_id: UUID
    dispatched_at: datetime
    http_status: int
    response_body: str
    crm_ref: Optional[str] = None
