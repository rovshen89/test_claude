# backend/app/api/bom.py
from typing import Dict
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.bom import MaterialInfo, generate_bom
from app.core.deps import get_current_user, get_db
from app.models.configuration import Configuration
from app.models.material import Material
from app.models.project import Project
from app.models.user import User
from app.schemas.applied_config import AppliedConfig
from app.schemas.bom import BomRequest, BomResponse

router = APIRouter()


@router.post("/generate", response_model=BomResponse)
async def generate_bom_endpoint(
    body: BomRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    cfg = await db.get(Configuration, body.configuration_id)
    if not cfg:
        raise HTTPException(status_code=404, detail="Configuration not found")

    project = await db.get(Project, cfg.project_id)
    if not project or project.user_id != user.id:
        raise HTTPException(status_code=404, detail="Configuration not found")

    try:
        applied = AppliedConfig.model_validate(cfg.applied_config)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    material_ids = {p.material_id for p in applied.panels}
    materials: Dict[UUID, MaterialInfo] = {}
    for mid in material_ids:
        mat = await db.get(Material, mid)
        if not mat:
            raise HTTPException(status_code=422, detail=f"Material {mid} not found")
        materials[mid] = MaterialInfo(name=mat.name, sku=mat.sku)

    return generate_bom(applied, materials)
