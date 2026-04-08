# backend/app/api/furniture_types.py
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db, require_role
from app.models.furniture_type import FurnitureType
from app.models.user import User
from app.schemas.furniture_type import FurnitureTypeCreate, FurnitureTypeResponse

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
        tenant_id=body.tenant_id if body.tenant_id else user.tenant_id,
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
    return ft
