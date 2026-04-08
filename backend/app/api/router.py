# backend/app/api/router.py
from fastapi import APIRouter

from app.api import auth, projects

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(projects.router, prefix="/projects", tags=["projects"])

# Routers registered as they are implemented in later tasks:
# from app.api import furniture_types, configurations
# api_router.include_router(furniture_types.router, prefix="/furniture-types", tags=["furniture-types"])
# api_router.include_router(configurations.router, prefix="/configurations", tags=["configurations"])
