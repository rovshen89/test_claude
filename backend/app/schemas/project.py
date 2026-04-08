# backend/app/schemas/project.py
from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel


class ProjectCreate(BaseModel):
    name: str


class RoomSchemaUpdate(BaseModel):
    room_schema: dict[str, Any]


class ProjectResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    user_id: UUID
    name: str
    room_schema: Optional[dict[str, Any]]
    created_at: datetime
    updated_at: datetime
