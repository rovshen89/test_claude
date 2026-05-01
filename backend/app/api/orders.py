# backend/app/api/orders.py
import asyncio
import logging
from decimal import Decimal
from typing import Dict, List
from uuid import UUID, uuid4

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
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
import httpx
from datetime import datetime, timezone
from app.core.webhook import build_payload, extract_crm_ref
from app.schemas.applied_config import AppliedConfig
from app.schemas.order import OrderCreate, OrderResponse, DispatchResponse

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
    if not ft:
        raise HTTPException(status_code=422, detail="Furniture type not found")
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
        # Note: if the DB commit below fails, these S3 objects become orphaned.
        # A lifecycle rule or cleanup job should handle stale uploads.
    except Exception:
        logger.exception("Export/upload failed for order %s", order_id)
        raise HTTPException(status_code=500, detail="Export generation failed")

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
    try:
        db.add(order)
        await db.commit()
        await db.refresh(order)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Order already exists for this configuration")
    return {
        "id": order.id,
        "configuration_id": order.configuration_id,
        "project_id": cfg.project_id,
        "pricing_snapshot": order.pricing_snapshot,
        "bom_snapshot": order.bom_snapshot,
        "export_urls": order.export_urls,
        "crm_ref": order.crm_ref,
        "last_dispatch": order.last_dispatch,
        "created_at": order.created_at,
    }


@router.get("", response_model=List[OrderResponse])
async def list_orders(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = (
        select(Order, Configuration.project_id)
        .join(Configuration, Order.configuration_id == Configuration.id)
        .join(Project, Configuration.project_id == Project.id)
        .where(Project.user_id == user.id)
    )
    result = await db.execute(stmt)
    return [
        {
            "id": order.id,
            "configuration_id": order.configuration_id,
            "project_id": project_id,
            "pricing_snapshot": order.pricing_snapshot,
            "bom_snapshot": order.bom_snapshot,
            "export_urls": order.export_urls,
            "crm_ref": order.crm_ref,
            "last_dispatch": order.last_dispatch,
            "created_at": order.created_at,
        }
        for order, project_id in result.all()
    ]


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
    if not cfg:
        raise HTTPException(status_code=404, detail="Order not found")
    project = await db.get(Project, cfg.project_id)
    if not project or project.user_id != user.id:
        raise HTTPException(status_code=404, detail="Order not found")

    return {
        "id": order.id,
        "configuration_id": order.configuration_id,
        "project_id": cfg.project_id,
        "pricing_snapshot": order.pricing_snapshot,
        "bom_snapshot": order.bom_snapshot,
        "export_urls": order.export_urls,
        "crm_ref": order.crm_ref,
        "last_dispatch": order.last_dispatch,
        "created_at": order.created_at,
    }


@router.post("/{order_id}/dispatch", response_model=DispatchResponse)
async def dispatch_order(
    order_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Load order and check ownership
    order = await db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    cfg = await db.get(Configuration, order.configuration_id)
    if not cfg:
        raise HTTPException(status_code=404, detail="Order not found")
    project = await db.get(Project, cfg.project_id)
    if not project or project.user_id != user.id:
        raise HTTPException(status_code=404, detail="Order not found")

    # Validate tenant has a webhook URL configured
    if not user.tenant_id:
        raise HTTPException(
            status_code=422, detail="No webhook URL configured for this tenant"
        )
    tenant = await db.get(Tenant, user.tenant_id)
    if not tenant or not tenant.webhook_url:
        raise HTTPException(
            status_code=422, detail="No webhook URL configured for this tenant"
        )

    # Build payload and fire the webhook
    payload = build_payload(order, tenant.crm_config)
    raw_headers = (tenant.crm_config or {}).get("headers", {})
    if not isinstance(raw_headers, dict) or not all(
        isinstance(k, str) and isinstance(v, str)
        for k, v in raw_headers.items()
    ):
        raise HTTPException(status_code=422, detail="Invalid crm_config headers")
    extra_headers = raw_headers
    dispatched_at = datetime.now(timezone.utc)
    try:
        async with httpx.AsyncClient(timeout=10.0) as hc:
            resp = await hc.post(
                tenant.webhook_url, json=payload, headers=extra_headers
            )
        http_status = resp.status_code
        MAX_RESPONSE_BODY = 4096
        raw_bytes = resp.content[:MAX_RESPONSE_BODY]
        response_body = raw_bytes.decode("utf-8", errors="replace")
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502, detail=f"Webhook delivery failed: {exc}"
        )

    # Extract crm_ref from 2xx responses only
    crm_ref = None
    if 200 <= http_status < 300:
        try:
            crm_ref = extract_crm_ref(resp.json(), tenant.crm_config)
        except Exception:
            logger.warning(
                "extract_crm_ref failed for order %s (http_status=%s)",
                order_id,
                http_status,
                exc_info=True,
            )
        # crm_ref is intentionally overwritten on each dispatch — the latest
        # successful CRM acknowledgement is always authoritative.
        if crm_ref:
            order.crm_ref = crm_ref

    # Record the dispatch attempt (overwrites previous)
    order.last_dispatch = {
        "dispatched_at": dispatched_at.isoformat(),
        "http_status": http_status,
        "response_body": response_body,
    }
    try:
        await db.commit()
        await db.refresh(order)
    except Exception:
        await db.rollback()
        logger.exception("Failed to persist dispatch result for order %s", order_id)
        raise HTTPException(status_code=500, detail="Failed to record dispatch result")

    return DispatchResponse(
        order_id=order.id,
        dispatched_at=dispatched_at,
        http_status=http_status,
        response_body=response_body,
        crm_ref=crm_ref,
    )
