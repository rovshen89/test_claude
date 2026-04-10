# backend/app/api/pricing.py
from decimal import Decimal
from typing import Dict
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db
from app.core.pricing import MaterialPricing, calculate_pricing
from app.models.configuration import Configuration
from app.models.furniture_type import FurnitureType
from app.models.material import Material
from app.models.project import Project
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.applied_config import AppliedConfig
from app.schemas.pricing import PricingRequest, PricingResponse

router = APIRouter()


@router.post("/calculate", response_model=PricingResponse)
async def calculate_price(
    body: PricingRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    cfg = await db.get(Configuration, body.configuration_id)
    if not cfg:
        raise HTTPException(status_code=404, detail="Configuration not found")

    project = await db.get(Project, cfg.project_id)
    if not project or (project.user_id != user.id and user.role != "admin"):
        raise HTTPException(status_code=404, detail="Configuration not found")

    margin_pct = Decimal("0")
    if user.tenant_id:
        tenant = await db.get(Tenant, user.tenant_id)
        if tenant:
            margin_pct = tenant.margin_pct

    ft = await db.get(FurnitureType, cfg.furniture_type_id)
    labor_rate = Decimal(str(ft.schema.get("labor_rate", "0")))

    try:
        applied = AppliedConfig.model_validate(cfg.applied_config)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    material_ids = {p.material_id for p in applied.panels}
    materials: Dict[UUID, MaterialPricing] = {}
    for mid in material_ids:
        mat = await db.get(Material, mid)
        if not mat:
            raise HTTPException(status_code=422, detail=f"Material {mid} not found")
        materials[mid] = MaterialPricing(
            price_per_m2=mat.price_per_m2,
            edgebanding_price_per_mm=mat.edgebanding_price_per_mm,
        )

    return calculate_pricing(applied, materials, labor_rate, margin_pct)
