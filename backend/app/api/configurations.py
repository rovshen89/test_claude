# backend/app/api/configurations.py
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db
from app.models.configuration import Configuration
from app.models.project import Project
from app.models.user import User
from app.schemas.configuration import (
    ConfigurationCreate,
    ConfigurationResponse,
    ConfigurationUpdate,
)

router = APIRouter()


async def _get_owned_project(db: AsyncSession, project_id: UUID, user: User) -> Project:
    project = await db.get(Project, project_id)
    if not project or project.user_id != user.id:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.post("", response_model=ConfigurationResponse, status_code=status.HTTP_201_CREATED)
async def create_configuration(
    body: ConfigurationCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_owned_project(db, body.project_id, user)
    config = Configuration(**body.model_dump())
    db.add(config)
    await db.commit()
    await db.refresh(config)
    return config


@router.get("/{config_id}", response_model=ConfigurationResponse)
async def get_configuration(
    config_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    config = await db.get(Configuration, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="Configuration not found")
    await _get_owned_project(db, config.project_id, user)
    return config


@router.put("/{config_id}", response_model=ConfigurationResponse)
async def update_configuration(
    config_id: UUID,
    body: ConfigurationUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    config = await db.get(Configuration, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="Configuration not found")
    await _get_owned_project(db, config.project_id, user)

    if body.applied_config is not None:
        config.applied_config = body.applied_config
    if body.placement is not None:
        config.placement = body.placement

    await db.commit()
    await db.refresh(config)
    return config


@router.post("/{config_id}/confirm", response_model=ConfigurationResponse)
async def confirm_configuration(
    config_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    config = await db.get(Configuration, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="Configuration not found")
    await _get_owned_project(db, config.project_id, user)

    if config.status != "draft":
        raise HTTPException(
            status_code=400, detail="Only draft configurations can be confirmed"
        )

    config.status = "confirmed"
    await db.commit()
    await db.refresh(config)
    return config
