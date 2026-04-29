# backend/app/api/tenants.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.tenant import TenantResponse, TenantUpdate

router = APIRouter()


@router.get("/me", response_model=TenantResponse)
async def get_my_tenant(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not user.tenant_id:
        raise HTTPException(status_code=404, detail="No tenant associated with this account")
    tenant = await db.get(Tenant, user.tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant


@router.put("/me", response_model=TenantResponse)
async def update_my_tenant(
    body: TenantUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not user.tenant_id:
        raise HTTPException(status_code=404, detail="No tenant associated with this account")
    tenant = await db.get(Tenant, user.tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(tenant, field, value)
    await db.commit()
    await db.refresh(tenant)
    return tenant
