# backend/app/api/materials.py
import json
import uuid as _uuid
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db, require_role
from app.core.pbr import validate_and_extract_pbr_zip
from app.core.storage import get_public_url, upload_bytes
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


@router.post("/upload", response_model=MaterialResponse, status_code=status.HTTP_201_CREATED)
async def upload_material(
    name: str = Form(...),
    sku: str = Form(...),
    category: str = Form(...),
    price_per_m2: float = Form(...),
    thickness_options: str = Form(...),  # JSON string, e.g. "[16, 18, 22]"
    edgebanding_price_per_mm: Optional[float] = Form(None),
    grain_direction: str = Form("none"),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "manufacturer")),
):
    # Parse thickness_options JSON string
    try:
        thickness_list = json.loads(thickness_options)
        if not isinstance(thickness_list, list):
            raise ValueError("thickness_options must be a JSON array")
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    # Read and validate the ZIP
    zip_bytes = await file.read()
    try:
        pbr_maps = validate_and_extract_pbr_zip(zip_bytes)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    # Upload each PBR map to S3 under materials/{mat_id}/
    mat_id = _uuid.uuid4()
    s3_urls = {}
    for map_name, data in pbr_maps.items():
        key = f"materials/{mat_id}/{map_name}"
        upload_bytes(key, data, content_type="image/png")
        s3_urls[map_name] = get_public_url(key)

    mat = Material(
        id=mat_id,
        category=category,
        name=name,
        sku=sku,
        thickness_options=thickness_list,
        price_per_m2=price_per_m2,
        edgebanding_price_per_mm=edgebanding_price_per_mm,
        grain_direction=grain_direction,
        tenant_id=user.tenant_id,
        s3_albedo=s3_urls.get("albedo.png"),
        s3_normal=s3_urls.get("normal.png"),
        s3_roughness=s3_urls.get("roughness.png"),
        s3_ao=s3_urls.get("ao.png"),
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
