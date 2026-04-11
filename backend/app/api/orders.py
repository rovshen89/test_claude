# backend/app/api/orders.py
import asyncio
from decimal import Decimal
from typing import Dict, List
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.bom import MaterialInfo, generate_bom
from app.core.deps import get_current_user, get_db
from app.core.export_dxf import generate_dxf
from app.core.export_pdf import generate_pdf
from app.core.pricing import MaterialPricing, calculate_pricing
from app.core.storage import get_public_url, upload_bytes
from app.models.configuration import Configuration
from app.models.furniture_type import FurnitureType
from app.models.material import Material
from app.models.order import Order
from app.models.project import Project
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.applied_config import AppliedConfig
from app.schemas.order import OrderCreate, OrderResponse

router = APIRouter()


@router.post("", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
async def create_order(
    body: OrderCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    cfg = await db.get(Configuration, body.configuration_id)
    if not cfg:
        raise HTTPException(status_code=404, detail="Configuration not found")

    project = await db.get(Project, cfg.project_id)
    if not project or project.user_id != user.id:
        raise HTTPException(status_code=404, detail="Configuration not found")

    if cfg.status != "confirmed":
        raise HTTPException(
            status_code=422,
            detail="Configuration must be confirmed before ordering",
        )

    existing = await db.execute(
        select(Order).where(Order.configuration_id == body.configuration_id)
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=409, detail="Order already exists for this configuration"
        )

    # Load margin from tenant (0% if user has no tenant)
    margin_pct = Decimal("0")
    if user.tenant_id:
        tenant = await db.get(Tenant, user.tenant_id)
        if tenant:
            margin_pct = tenant.margin_pct

    # Load labor rate from furniture type schema
    ft = await db.get(FurnitureType, cfg.furniture_type_id)
    labor_rate = Decimal(str(ft.schema.get("labor_rate", "0")))

    # Parse applied config
    try:
        applied = AppliedConfig.model_validate(cfg.applied_config)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    # Load materials for BOM and Pricing engines
    material_ids = {p.material_id for p in applied.panels}
    bom_materials: Dict[UUID, MaterialInfo] = {}
    pricing_materials: Dict[UUID, MaterialPricing] = {}
    for mid in material_ids:
        mat = await db.get(Material, mid)
        if not mat:
            raise HTTPException(status_code=422, detail=f"Material {mid} not found")
        bom_materials[mid] = MaterialInfo(name=mat.name, sku=mat.sku)
        pricing_materials[mid] = MaterialPricing(
            price_per_m2=mat.price_per_m2,
            edgebanding_price_per_mm=mat.edgebanding_price_per_mm,
        )

    # Generate snapshots (pure functions, no I/O)
    bom = generate_bom(applied, bom_materials)
    pricing = calculate_pricing(applied, pricing_materials, labor_rate, margin_pct)

    # Generate export files and upload to S3
    order_id = uuid4()
    try:
        dxf_bytes = generate_dxf(bom)
        pdf_bytes = generate_pdf(bom, pricing)
        dxf_key = f"orders/{order_id}/output.dxf"
        pdf_key = f"orders/{order_id}/output.pdf"
        await asyncio.to_thread(upload_bytes, dxf_key, dxf_bytes, "application/dxf")
        await asyncio.to_thread(upload_bytes, pdf_key, pdf_bytes, "application/pdf")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Export upload failed: {exc}")

    export_urls = {
        "dxf": get_public_url(dxf_key),
        "pdf": get_public_url(pdf_key),
    }

    order = Order(
        id=order_id,
        configuration_id=body.configuration_id,
        pricing_snapshot=pricing.model_dump(mode="json"),
        bom_snapshot=bom.model_dump(mode="json"),
        export_urls=export_urls,
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)
    return order


@router.get("", response_model=List[OrderResponse])
async def list_orders(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = (
        select(Order)
        .join(Configuration, Order.configuration_id == Configuration.id)
        .join(Project, Configuration.project_id == Project.id)
        .where(Project.user_id == user.id)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/{order_id}", response_model=OrderResponse)
async def get_order(
    order_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    order = await db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    cfg = await db.get(Configuration, order.configuration_id)
    project = await db.get(Project, cfg.project_id)
    if not project or project.user_id != user.id:
        raise HTTPException(status_code=404, detail="Order not found")

    return order
