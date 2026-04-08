# backend/app/schemas/configuration.py
from typing import Any, Dict, Optional
from uuid import UUID

from pydantic import BaseModel


class ConfigurationCreate(BaseModel):
    project_id: UUID
    furniture_type_id: UUID
    applied_config: Dict[str, Any]
    placement: Optional[Dict[str, Any]] = None


class ConfigurationUpdate(BaseModel):
    applied_config: Optional[Dict[str, Any]] = None
    placement: Optional[Dict[str, Any]] = None


class ConfigurationResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    project_id: UUID
    furniture_type_id: UUID
    applied_config: Dict[str, Any]
    placement: Optional[Dict[str, Any]]
    status: str
