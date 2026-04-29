# backend/app/api/router.py
from fastapi import APIRouter

from app.api import auth, bom, configurations, furniture_types, materials, orders, pricing, projects, tenants

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(projects.router, prefix="/projects", tags=["projects"])
api_router.include_router(furniture_types.router, prefix="/furniture-types", tags=["furniture-types"])
api_router.include_router(configurations.router, prefix="/configurations", tags=["configurations"])
api_router.include_router(materials.router, prefix="/materials", tags=["materials"])
api_router.include_router(pricing.router, prefix="/pricing", tags=["pricing"])
api_router.include_router(bom.router, prefix="/bom", tags=["bom"])
api_router.include_router(orders.router, prefix="/orders", tags=["orders"])
api_router.include_router(tenants.router, prefix="/tenants", tags=["tenants"])
