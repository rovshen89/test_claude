# backend/app/api/router.py
from fastapi import APIRouter

from app.api import auth

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])

# Routers registered as they are implemented in later tasks:
# from app.api import projects, furniture_types, configurations
# api_router.include_router(projects.router, prefix="/projects", tags=["projects"])
# api_router.include_router(furniture_types.router, prefix="/furniture-types", tags=["furniture-types"])
# api_router.include_router(configurations.router, prefix="/configurations", tags=["configurations"])
