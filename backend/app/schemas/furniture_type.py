# backend/app/schemas/furniture_type.py
from typing import Any, Dict, Optional
from uuid import UUID

from pydantic import BaseModel


class FurnitureTypeCreate(BaseModel):
    category: str
    schema: Dict[str, Any]
    tenant_id: Optional[UUID] = None


class FurnitureTypeResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    tenant_id: Optional[UUID]
    category: str
    schema: Dict[str, Any]
