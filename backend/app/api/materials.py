# backend/app/api/materials.py
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db, require_role
from app.models.material import Material
from app.models.user import User
from app.schemas.material import MaterialCreate, MaterialResponse, MaterialUpdate

router = APIRouter()


def _check_tenant_access(material: Material, user: User) -> None:
    """Raise 404 if material is tenant-private and caller doesn't belong to that tenant."""
    if material.tenant_id is not None and material.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="Material not found")


@router.get("", response_model=List[MaterialResponse])
async def list_materials(
    category: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(Material).where(
        or_(Material.tenant_id.is_(None), Material.tenant_id == user.tenant_id)
    )
    if category:
        stmt = stmt.where(Material.category == category)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("", response_model=MaterialResponse, status_code=status.HTTP_201_CREATED)
async def create_material(
    body: MaterialCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "manufacturer")),
):
    mat = Material(
        category=body.category,
        name=body.name,
        sku=body.sku,
        thickness_options=body.thickness_options,
        price_per_m2=body.price_per_m2,
        edgebanding_price_per_mm=body.edgebanding_price_per_mm,
        grain_direction=body.grain_direction,
        tenant_id=body.tenant_id if user.role == "admin" else user.tenant_id,
    )
    db.add(mat)
    await db.commit()
    await db.refresh(mat)
    return mat


@router.get("/{mat_id}", response_model=MaterialResponse)
async def get_material(
    mat_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    mat = await db.get(Material, mat_id)
    if not mat:
        raise HTTPException(status_code=404, detail="Material not found")
    _check_tenant_access(mat, user)
    return mat


@router.put("/{mat_id}", response_model=MaterialResponse)
async def update_material(
    mat_id: UUID,
    body: MaterialUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "manufacturer")),
):
    mat = await db.get(Material, mat_id)
    if not mat:
        raise HTTPException(status_code=404, detail="Material not found")
    _check_tenant_access(mat, user)

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(mat, field, value)

    await db.commit()
    await db.refresh(mat)
    return mat
