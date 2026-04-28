# backend/app/api/furniture_types.py
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db, require_role
from app.models.furniture_type import FurnitureType
from app.models.user import User
from app.models.configuration import Configuration
from app.schemas.furniture_type import FurnitureTypeCreate, FurnitureTypeUpdate, FurnitureTypeResponse

router = APIRouter()


@router.get("", response_model=List[FurnitureTypeResponse])
async def list_furniture_types(
    category: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(FurnitureType).where(
        or_(FurnitureType.tenant_id.is_(None), FurnitureType.tenant_id == user.tenant_id)
    )
    if category:
        stmt = stmt.where(FurnitureType.category == category)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("", response_model=FurnitureTypeResponse, status_code=status.HTTP_201_CREATED)
async def create_furniture_type(
    body: FurnitureTypeCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "manufacturer")),
):
    ft = FurnitureType(
        category=body.category,
        schema=body.schema,
        tenant_id=body.tenant_id if user.role == "admin" else user.tenant_id,
    )
    db.add(ft)
    await db.commit()
    await db.refresh(ft)
    return ft


@router.get("/{ft_id}", response_model=FurnitureTypeResponse)
async def get_furniture_type(
    ft_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ft = await db.get(FurnitureType, ft_id)
    if not ft:
        raise HTTPException(status_code=404, detail="Furniture type not found")
    # Tenant isolation: only global templates or own tenant's types are accessible
    if ft.tenant_id is not None and ft.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="Furniture type not found")
    return ft


@router.put("/{ft_id}", response_model=FurnitureTypeResponse)
async def update_furniture_type(
    ft_id: UUID,
    body: FurnitureTypeUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "manufacturer")),
):
    ft = await db.get(FurnitureType, ft_id)
    if not ft:
        raise HTTPException(status_code=404, detail="Furniture type not found")
    if ft.tenant_id is not None and ft.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="Furniture type not found")
    if ft.tenant_id is None and user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can modify global furniture types")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(ft, field, value)
    await db.commit()
    await db.refresh(ft)
    return ft


@router.delete("/{ft_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_furniture_type(
    ft_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "manufacturer")),
):
    ft = await db.get(FurnitureType, ft_id)
    if not ft:
        raise HTTPException(status_code=404, detail="Furniture type not found")
    if ft.tenant_id is not None and ft.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="Furniture type not found")
    if ft.tenant_id is None and user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete global furniture types")
    result = await db.execute(
        select(Configuration).where(Configuration.furniture_type_id == ft_id).limit(1)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail="Cannot delete: furniture type is used by existing configurations",
        )
    await db.delete(ft)
    await db.commit()
