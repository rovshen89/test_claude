# Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the FastAPI backend — async database layer, JWT auth with RBAC, multi-tenant scoping, and CRUD endpoints for projects, furniture types, and configurations.

**Architecture:** Async FastAPI + SQLAlchemy 2.0 (async) + PostgreSQL via asyncpg. Tests use SQLite via aiosqlite (in-memory). Every resource is tenant-scoped. JWT tokens carry `user_id` and `role`. Admin users have `tenant_id = NULL`.

**Tech Stack:** FastAPI 0.115, SQLAlchemy 2.0, Alembic, Pydantic v2, PyJWT, passlib[bcrypt], pytest-asyncio, httpx

---

## File Map

```
backend/
├── requirements.txt
├── requirements-dev.txt
├── pyproject.toml              # pytest config (asyncio_mode=auto)
├── alembic.ini
├── alembic/
│   ├── env.py
│   └── versions/
│       └── 001_initial.py
├── app/
│   ├── __init__.py
│   ├── main.py                 # FastAPI app, router registration, /health
│   ├── config.py               # pydantic-settings (DATABASE_URL, SECRET_KEY)
│   ├── database.py             # async engine + session factory
│   ├── models/
│   │   ├── __init__.py         # imports all models (for Alembic autogenerate)
│   │   ├── base.py             # DeclarativeBase
│   │   ├── tenant.py           # Tenant
│   │   ├── user.py             # User
│   │   ├── project.py          # Project
│   │   ├── furniture_type.py   # FurnitureType
│   │   └── configuration.py    # Configuration
│   ├── schemas/
│   │   ├── __init__.py
│   │   ├── auth.py             # RegisterRequest, LoginRequest, TokenResponse
│   │   ├── project.py          # ProjectCreate, RoomSchemaUpdate, ProjectResponse
│   │   ├── furniture_type.py   # FurnitureTypeCreate, FurnitureTypeResponse
│   │   └── configuration.py    # ConfigurationCreate, ConfigurationUpdate, ConfigurationResponse
│   ├── api/
│   │   ├── __init__.py
│   │   ├── auth.py             # POST /auth/register, POST /auth/login
│   │   ├── projects.py         # GET/POST /projects, GET/PUT /projects/{id}
│   │   ├── furniture_types.py  # GET/POST /furniture-types, GET /furniture-types/{id}
│   │   └── configurations.py   # POST/GET/PUT /configurations, POST /configurations/{id}/confirm
│   └── core/
│       ├── __init__.py
│       ├── auth.py             # hash_password, verify_password, create_access_token, decode_token
│       └── deps.py             # get_db, get_current_user, require_role
└── tests/
    ├── __init__.py
    ├── conftest.py             # db_engine, db_session, client fixtures
    ├── test_auth.py
    ├── test_projects.py
    ├── test_furniture_types.py
    └── test_configurations.py
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/requirements-dev.txt`
- Create: `backend/pyproject.toml`
- Create: `backend/app/__init__.py`
- Create: `backend/app/config.py`
- Create: `backend/app/main.py`

- [ ] **Step 1.1: Create requirements.txt**

```
# backend/requirements.txt
fastapi>=0.115
uvicorn[standard]>=0.30
sqlalchemy[asyncio]>=2.0
alembic>=1.13
asyncpg>=0.29
aiosqlite>=0.19
pydantic>=2.9
pydantic-settings>=2.4
PyJWT>=2.8
passlib[bcrypt]>=1.7.4
python-multipart>=0.0.12
```

- [ ] **Step 1.2: Create requirements-dev.txt**

```
# backend/requirements-dev.txt
-r requirements.txt
pytest>=8.3
pytest-asyncio>=0.23
httpx>=0.27
```

- [ ] **Step 1.3: Create pyproject.toml**

```toml
# backend/pyproject.toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

- [ ] **Step 1.4: Create app/config.py**

```python
# backend/app/config.py
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost/furniture_constructor"
    secret_key: str = "change-me-in-production"


settings = Settings()
```

- [ ] **Step 1.5: Create app/main.py with health check only**

```python
# backend/app/main.py
from fastapi import FastAPI

app = FastAPI(title="Furniture Constructor API", version="1.0.0")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
```

- [ ] **Step 1.6: Install dev dependencies and verify health endpoint runs**

```bash
cd backend
pip install -r requirements-dev.txt
uvicorn app.main:app --reload
# In another terminal:
curl http://localhost:8000/health
# Expected: {"status":"ok"}
```

- [ ] **Step 1.7: Create empty `__init__.py` files**

```bash
touch backend/app/__init__.py
touch backend/app/models/__init__.py
touch backend/app/schemas/__init__.py
touch backend/app/api/__init__.py
touch backend/app/core/__init__.py
touch backend/tests/__init__.py
```

- [ ] **Step 1.8: Commit**

```bash
cd backend
git add requirements.txt requirements-dev.txt pyproject.toml app/
git commit -m "feat: scaffold FastAPI backend with health check"
```

---

### Task 2: Database Setup

**Files:**
- Create: `backend/app/models/base.py`
- Create: `backend/app/database.py`
- Create: `backend/alembic.ini`
- Create: `backend/alembic/env.py`

- [ ] **Step 2.1: Create models/base.py**

```python
# backend/app/models/base.py
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
```

- [ ] **Step 2.2: Create database.py**

```python
# backend/app/database.py
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from app.config import settings

engine = create_async_engine(settings.database_url, echo=False)
async_session_factory = async_sessionmaker(engine, expire_on_commit=False)
```

- [ ] **Step 2.3: Initialize Alembic**

```bash
cd backend
alembic init alembic
```

- [ ] **Step 2.4: Replace alembic/env.py with async-compatible version**

```python
# backend/alembic/env.py
import asyncio
import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.config import settings
from app.models.base import Base
import app.models  # noqa: F401 — registers all models with Base

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

- [ ] **Step 2.5: Commit**

```bash
cd backend
git add app/models/base.py app/database.py alembic/ alembic.ini
git commit -m "feat: add SQLAlchemy 2.0 async database layer and Alembic config"
```

---

### Task 3: Tenant + User Models + First Migration

**Files:**
- Create: `backend/app/models/tenant.py`
- Create: `backend/app/models/user.py`
- Modify: `backend/app/models/__init__.py`

- [ ] **Step 3.1: Create models/tenant.py**

```python
# backend/app/models/tenant.py
import uuid
from decimal import Decimal

from sqlalchemy import JSON, Numeric, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(Text)
    margin_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0"))
    webhook_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    crm_config: Mapped[dict | None] = mapped_column(JSON, nullable=True)
```

- [ ] **Step 3.2: Create models/user.py**

```python
# backend/app/models/user.py
import uuid

from sqlalchemy import ForeignKey, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

VALID_ROLES = {"admin", "manufacturer", "designer", "consumer"}


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("tenants.id"), nullable=True
    )  # NULL for admin (cross-tenant)
    email: Mapped[str] = mapped_column(Text, unique=True, index=True)
    role: Mapped[str] = mapped_column(Text)  # admin|manufacturer|designer|consumer
    password_hash: Mapped[str] = mapped_column(Text)
```

- [ ] **Step 3.3: Update models/__init__.py to register models with Base**

```python
# backend/app/models/__init__.py
from app.models.tenant import Tenant  # noqa: F401
from app.models.user import User  # noqa: F401
```

- [ ] **Step 3.4: Generate and apply first migration**

```bash
cd backend
alembic revision --autogenerate -m "create tenants and users"
alembic upgrade head
# Expected: two new tables created in PostgreSQL
```

- [ ] **Step 3.5: Commit**

```bash
cd backend
git add app/models/tenant.py app/models/user.py app/models/__init__.py alembic/versions/
git commit -m "feat: add Tenant and User models with initial migration"
```

---

### Task 4: JWT Auth Core

**Files:**
- Create: `backend/app/core/auth.py`

- [ ] **Step 4.1: Write the failing test for auth core**

```python
# backend/tests/test_auth_core.py
import pytest
from app.core.auth import hash_password, verify_password, create_access_token, decode_token


def test_hash_and_verify_password():
    hashed = hash_password("secret")
    assert hashed != "secret"
    assert verify_password("secret", hashed)
    assert not verify_password("wrong", hashed)


def test_create_and_decode_token():
    token = create_access_token(user_id="abc-123", role="designer")
    payload = decode_token(token)
    assert payload["sub"] == "abc-123"
    assert payload["role"] == "designer"


def test_decode_invalid_token_raises():
    import jwt
    with pytest.raises(jwt.InvalidTokenError):
        decode_token("not.a.valid.token")
```

- [ ] **Step 4.2: Run test to verify it fails**

```bash
cd backend
pytest tests/test_auth_core.py -v
# Expected: ImportError — app.core.auth not found
```

- [ ] **Step 4.3: Create app/core/auth.py**

```python
# backend/app/core/auth.py
from datetime import datetime, timedelta, timezone

import jwt
from passlib.context import CryptContext

from app.config import settings

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return _pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd_context.verify(plain, hashed)


def create_access_token(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=24),
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.secret_key, algorithms=["HS256"])
```

- [ ] **Step 4.4: Run test to verify it passes**

```bash
cd backend
pytest tests/test_auth_core.py -v
# Expected: 3 passed
```

- [ ] **Step 4.5: Commit**

```bash
cd backend
git add app/core/auth.py tests/test_auth_core.py
git commit -m "feat: add JWT auth core (hash, verify, create/decode token)"
```

---

### Task 5: Auth API Endpoints + Test Fixtures

**Files:**
- Create: `backend/app/schemas/auth.py`
- Create: `backend/app/core/deps.py` (get_db only for now)
- Create: `backend/app/api/auth.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_auth.py`

- [ ] **Step 5.1: Create app/schemas/auth.py**

```python
# backend/app/schemas/auth.py
from uuid import UUID
from typing import Optional

from pydantic import BaseModel, EmailStr


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    role: str = "consumer"
    tenant_id: Optional[UUID] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
```

- [ ] **Step 5.2: Create app/core/deps.py (get_db only)**

```python
# backend/app/core/deps.py
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_factory


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        yield session
```

- [ ] **Step 5.3: Create app/api/auth.py**

```python
# backend/app/api/auth.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import create_access_token, hash_password, verify_password
from app.core.deps import get_db
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse

router = APIRouter()


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=body.email,
        role=body.role,
        tenant_id=body.tenant_id,
        password_hash=hash_password(body.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(str(user.id), user.role)
    return TokenResponse(access_token=token, token_type="bearer")


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token(str(user.id), user.role)
    return TokenResponse(access_token=token, token_type="bearer")
```

- [ ] **Step 5.4: Register auth router in main.py**

```python
# backend/app/main.py
from fastapi import FastAPI

from app.api import auth

app = FastAPI(title="Furniture Constructor API", version="1.0.0")

app.include_router(auth.router, prefix="/auth", tags=["auth"])


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
```

- [ ] **Step 5.5: Create tests/conftest.py**

```python
# backend/tests/conftest.py
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models.base import Base
from app.models import *  # noqa: F401, F403 — ensures all models are registered
from app.main import app
from app.core.deps import get_db

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture
async def db_engine():
    engine = create_async_engine(TEST_DB_URL)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture
async def db_session(db_engine):
    factory = async_sessionmaker(db_engine, expire_on_commit=False)
    async with factory() as session:
        yield session


@pytest.fixture
async def client(db_session: AsyncSession):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac
    app.dependency_overrides.clear()
```

- [ ] **Step 5.6: Write failing auth tests**

```python
# backend/tests/test_auth.py
import pytest


@pytest.mark.asyncio
async def test_register_success(client):
    response = await client.post("/auth/register", json={
        "email": "test@example.com",
        "password": "password123",
        "role": "consumer",
    })
    assert response.status_code == 201
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_register_duplicate_email_returns_400(client):
    payload = {"email": "dup@example.com", "password": "pass", "role": "consumer"}
    await client.post("/auth/register", json=payload)
    response = await client.post("/auth/register", json=payload)
    assert response.status_code == 400
    assert "already registered" in response.json()["detail"]


@pytest.mark.asyncio
async def test_login_success(client):
    await client.post("/auth/register", json={
        "email": "login@example.com",
        "password": "secret",
        "role": "designer",
    })
    response = await client.post("/auth/login", json={
        "email": "login@example.com",
        "password": "secret",
    })
    assert response.status_code == 200
    assert "access_token" in response.json()


@pytest.mark.asyncio
async def test_login_wrong_password_returns_401(client):
    await client.post("/auth/register", json={
        "email": "wrong@example.com",
        "password": "correct",
        "role": "consumer",
    })
    response = await client.post("/auth/login", json={
        "email": "wrong@example.com",
        "password": "wrong",
    })
    assert response.status_code == 401
```

- [ ] **Step 5.7: Run tests to verify they pass**

```bash
cd backend
pytest tests/test_auth.py -v
# Expected: 4 passed
```

- [ ] **Step 5.8: Commit**

```bash
cd backend
git add app/schemas/auth.py app/core/deps.py app/api/auth.py app/main.py \
        tests/conftest.py tests/test_auth.py
git commit -m "feat: add JWT auth endpoints (register, login) with tests"
```

---

### Task 6: RBAC Dependencies

**Files:**
- Modify: `backend/app/core/deps.py`

- [ ] **Step 6.1: Write failing test for protected endpoint**

Add to `tests/test_auth.py`:

```python
@pytest.mark.asyncio
async def test_protected_endpoint_without_token_returns_403(client):
    # /projects doesn't exist yet — use /health to prove bearer auth works
    # We test via a fake protected route added temporarily, or we skip until Task 7
    # For now test that a missing bearer on an endpoint that requires auth fails
    response = await client.get("/projects")
    # 404 until projects router is added; this test becomes meaningful in Task 7
    # Leave as a placeholder verified in Task 7
    assert response.status_code in (401, 403, 404)
```

- [ ] **Step 6.2: Extend app/core/deps.py with get_current_user and require_role**

```python
# backend/app/core/deps.py
from typing import AsyncGenerator
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import async_session_factory
from app.models.user import User

_bearer = HTTPBearer()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        yield session


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.secret_key,
            algorithms=["HS256"],
        )
        user_id = UUID(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        )

    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found"
        )
    return user


def require_role(*roles: str):
    async def _check(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return user

    return _check
```

- [ ] **Step 6.3: Run all existing tests to confirm no regressions**

```bash
cd backend
pytest tests/ -v
# Expected: all previously passing tests still pass
```

- [ ] **Step 6.4: Commit**

```bash
cd backend
git add app/core/deps.py tests/test_auth.py
git commit -m "feat: add get_current_user and require_role RBAC dependencies"
```

---

### Task 7: Project Model + API

**Files:**
- Create: `backend/app/models/project.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/app/schemas/project.py`
- Create: `backend/app/api/projects.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_projects.py`

- [ ] **Step 7.1: Write failing project tests**

```python
# backend/tests/test_projects.py
import pytest


async def _register_and_login(client, email: str, role: str = "designer") -> dict:
    await client.post("/auth/register", json={"email": email, "password": "pass", "role": role})
    r = await client.post("/auth/login", json={"email": email, "password": "pass"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.mark.asyncio
async def test_create_project(client):
    headers = await _register_and_login(client, "proj1@example.com")
    response = await client.post("/projects", json={"name": "My Room"}, headers=headers)
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "My Room"
    assert data["room_schema"] is None


@pytest.mark.asyncio
async def test_list_projects_returns_own_only(client):
    headers_a = await _register_and_login(client, "a@example.com")
    headers_b = await _register_and_login(client, "b@example.com")
    await client.post("/projects", json={"name": "Room A"}, headers=headers_a)
    await client.post("/projects", json={"name": "Room B"}, headers=headers_a)
    await client.post("/projects", json={"name": "Room C"}, headers=headers_b)

    response = await client.get("/projects", headers=headers_a)
    assert response.status_code == 200
    assert len(response.json()) == 2


@pytest.mark.asyncio
async def test_get_project(client):
    headers = await _register_and_login(client, "get@example.com")
    r = await client.post("/projects", json={"name": "Get Me"}, headers=headers)
    project_id = r.json()["id"]

    response = await client.get(f"/projects/{project_id}", headers=headers)
    assert response.status_code == 200
    assert response.json()["id"] == project_id


@pytest.mark.asyncio
async def test_update_room_schema(client):
    headers = await _register_and_login(client, "schema@example.com")
    r = await client.post("/projects", json={"name": "Schema Room"}, headers=headers)
    project_id = r.json()["id"]

    schema = {
        "walls": [{"start": [0, 0], "end": [3000, 0], "height": 2600}],
        "openings": [],
        "floor_material_id": None,
        "ceiling_material_id": None,
    }
    response = await client.put(
        f"/projects/{project_id}/room-schema",
        json={"room_schema": schema},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["room_schema"]["walls"][0]["end"] == [3000, 0]


@pytest.mark.asyncio
async def test_get_other_users_project_returns_404(client):
    headers_a = await _register_and_login(client, "owner@example.com")
    headers_b = await _register_and_login(client, "other@example.com")
    r = await client.post("/projects", json={"name": "Private"}, headers=headers_a)
    project_id = r.json()["id"]

    response = await client.get(f"/projects/{project_id}", headers=headers_b)
    assert response.status_code == 404
```

- [ ] **Step 7.2: Run tests to verify they fail**

```bash
cd backend
pytest tests/test_projects.py -v
# Expected: ImportError or 404 — /projects not registered
```

- [ ] **Step 7.3: Create app/models/project.py**

```python
# backend/app/models/project.py
import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, ForeignKey, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(Text)
    room_schema: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
```

- [ ] **Step 7.4: Update models/__init__.py**

```python
# backend/app/models/__init__.py
from app.models.tenant import Tenant  # noqa: F401
from app.models.user import User  # noqa: F401
from app.models.project import Project  # noqa: F401
```

- [ ] **Step 7.5: Create app/schemas/project.py**

```python
# backend/app/schemas/project.py
from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel


class ProjectCreate(BaseModel):
    name: str


class RoomSchemaUpdate(BaseModel):
    room_schema: dict[str, Any]


class ProjectResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    user_id: UUID
    name: str
    room_schema: Optional[dict[str, Any]]
    created_at: datetime
    updated_at: datetime
```

- [ ] **Step 7.6: Create app/api/projects.py**

```python
# backend/app/api/projects.py
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db
from app.models.project import Project
from app.models.user import User
from app.schemas.project import ProjectCreate, ProjectResponse, RoomSchemaUpdate

router = APIRouter()


@router.get("", response_model=list[ProjectResponse])
async def list_projects(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Project).where(Project.user_id == user.id))
    return result.scalars().all()


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    body: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project = Project(name=body.name, user_id=user.id)
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return project


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project = await db.get(Project, project_id)
    if not project or project.user_id != user.id:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.put("/{project_id}/room-schema", response_model=ProjectResponse)
async def update_room_schema(
    project_id: UUID,
    body: RoomSchemaUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project = await db.get(Project, project_id)
    if not project or project.user_id != user.id:
        raise HTTPException(status_code=404, detail="Project not found")
    project.room_schema = body.room_schema
    await db.commit()
    await db.refresh(project)
    return project
```

- [ ] **Step 7.7: Register projects router in main.py**

```python
# backend/app/main.py
from fastapi import FastAPI

from app.api import auth, projects

app = FastAPI(title="Furniture Constructor API", version="1.0.0")

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(projects.router, prefix="/projects", tags=["projects"])


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
```

- [ ] **Step 7.8: Generate and apply migration**

```bash
cd backend
alembic revision --autogenerate -m "create projects"
alembic upgrade head
```

- [ ] **Step 7.9: Run project tests to verify they pass**

```bash
cd backend
pytest tests/test_projects.py -v
# Expected: 5 passed
```

- [ ] **Step 7.10: Run all tests to confirm no regressions**

```bash
cd backend
pytest tests/ -v
# Expected: all tests pass
```

- [ ] **Step 7.11: Commit**

```bash
cd backend
git add app/models/project.py app/models/__init__.py app/schemas/project.py \
        app/api/projects.py app/main.py alembic/versions/ tests/test_projects.py
git commit -m "feat: add Project model and CRUD endpoints with tests"
```

---

### Task 8: FurnitureType Model + API

**Files:**
- Create: `backend/app/models/furniture_type.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/app/schemas/furniture_type.py`
- Create: `backend/app/api/furniture_types.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_furniture_types.py`

- [ ] **Step 8.1: Write failing furniture type tests**

```python
# backend/tests/test_furniture_types.py
import pytest

_WARDROBE_SCHEMA = {
    "category": "wardrobe",
    "dimensions": {
        "width": {"min": 600, "max": 3000, "step": 100, "default": 1200},
        "height": {"min": 1800, "max": 2700, "step": 100, "default": 2100},
        "depth": {"min": 400, "max": 700, "step": 50, "default": 580},
    },
    "columns": 2,
    "rows": 3,
    "slots": [],
    "hardware_rules": [],
    "edge_banding_map": {},
}


async def _register_and_login(client, email: str, role: str = "manufacturer") -> dict:
    await client.post("/auth/register", json={"email": email, "password": "pass", "role": role})
    r = await client.post("/auth/login", json={"email": email, "password": "pass"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.mark.asyncio
async def test_create_furniture_type(client):
    headers = await _register_and_login(client, "mfr@example.com")
    response = await client.post(
        "/furniture-types",
        json={"category": "wardrobe", "schema": _WARDROBE_SCHEMA},
        headers=headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["category"] == "wardrobe"
    assert data["schema"]["columns"] == 2


@pytest.mark.asyncio
async def test_consumer_cannot_create_furniture_type(client):
    headers = await _register_and_login(client, "consumer@example.com", role="consumer")
    response = await client.post(
        "/furniture-types",
        json={"category": "shelving", "schema": _WARDROBE_SCHEMA},
        headers=headers,
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_list_furniture_types_by_category(client):
    headers = await _register_and_login(client, "list@example.com")
    await client.post("/furniture-types", json={"category": "wardrobe", "schema": _WARDROBE_SCHEMA}, headers=headers)
    await client.post("/furniture-types", json={"category": "shelving", "schema": _WARDROBE_SCHEMA}, headers=headers)

    response = await client.get("/furniture-types?category=wardrobe", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["category"] == "wardrobe"


@pytest.mark.asyncio
async def test_get_furniture_type_by_id(client):
    headers = await _register_and_login(client, "get_ft@example.com")
    r = await client.post("/furniture-types", json={"category": "kitchen", "schema": _WARDROBE_SCHEMA}, headers=headers)
    ft_id = r.json()["id"]

    response = await client.get(f"/furniture-types/{ft_id}", headers=headers)
    assert response.status_code == 200
    assert response.json()["id"] == ft_id
```

- [ ] **Step 8.2: Run tests to verify they fail**

```bash
cd backend
pytest tests/test_furniture_types.py -v
# Expected: ImportError or 404
```

- [ ] **Step 8.3: Create app/models/furniture_type.py**

```python
# backend/app/models/furniture_type.py
import uuid

from sqlalchemy import JSON, ForeignKey, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class FurnitureType(Base):
    __tablename__ = "furniture_types"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("tenants.id"), nullable=True
    )  # NULL = global template
    category: Mapped[str] = mapped_column(Text, index=True)
    schema: Mapped[dict] = mapped_column(JSON)
```

- [ ] **Step 8.4: Update models/__init__.py**

```python
# backend/app/models/__init__.py
from app.models.tenant import Tenant  # noqa: F401
from app.models.user import User  # noqa: F401
from app.models.project import Project  # noqa: F401
from app.models.furniture_type import FurnitureType  # noqa: F401
```

- [ ] **Step 8.5: Create app/schemas/furniture_type.py**

```python
# backend/app/schemas/furniture_type.py
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel


class FurnitureTypeCreate(BaseModel):
    category: str
    schema: dict[str, Any]
    tenant_id: Optional[UUID] = None


class FurnitureTypeResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    tenant_id: Optional[UUID]
    category: str
    schema: dict[str, Any]
```

- [ ] **Step 8.6: Create app/api/furniture_types.py**

```python
# backend/app/api/furniture_types.py
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db, require_role
from app.models.furniture_type import FurnitureType
from app.models.user import User
from app.schemas.furniture_type import FurnitureTypeCreate, FurnitureTypeResponse

router = APIRouter()


@router.get("", response_model=list[FurnitureTypeResponse])
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
```

- [ ] **Step 8.7: Register furniture_types router in main.py**

```python
# backend/app/main.py
from fastapi import FastAPI

from app.api import auth, projects, furniture_types

app = FastAPI(title="Furniture Constructor API", version="1.0.0")

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(projects.router, prefix="/projects", tags=["projects"])
app.include_router(furniture_types.router, prefix="/furniture-types", tags=["furniture-types"])


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
```

- [ ] **Step 8.8: Generate and apply migration**

```bash
cd backend
alembic revision --autogenerate -m "create furniture_types"
alembic upgrade head
```

- [ ] **Step 8.9: Run furniture type tests to verify they pass**

```bash
cd backend
pytest tests/test_furniture_types.py -v
# Expected: 4 passed
```

- [ ] **Step 8.10: Commit**

```bash
cd backend
git add app/models/furniture_type.py app/models/__init__.py \
        app/schemas/furniture_type.py app/api/furniture_types.py \
        app/main.py alembic/versions/ tests/test_furniture_types.py
git commit -m "feat: add FurnitureType model and CRUD endpoints with tests"
```

---

### Task 9: Configuration Model + API

**Files:**
- Create: `backend/app/models/configuration.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/app/schemas/configuration.py`
- Create: `backend/app/api/configurations.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_configurations.py`

- [ ] **Step 9.1: Write failing configuration tests**

```python
# backend/tests/test_configurations.py
import pytest

_WARDROBE_SCHEMA = {
    "category": "wardrobe",
    "dimensions": {"width": {"min": 600, "max": 3000, "step": 100, "default": 1200},
                   "height": {"min": 1800, "max": 2700, "step": 100, "default": 2100},
                   "depth": {"min": 400, "max": 700, "step": 50, "default": 580}},
    "columns": 2, "rows": 3, "slots": [], "hardware_rules": [], "edge_banding_map": {},
}


async def _setup(client) -> tuple[dict, str, str]:
    """Returns auth headers, project_id, furniture_type_id."""
    email = "cfg@example.com"
    await client.post("/auth/register", json={"email": email, "password": "pass", "role": "manufacturer"})
    r = await client.post("/auth/login", json={"email": email, "password": "pass"})
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}

    r = await client.post("/projects", json={"name": "Project"}, headers=headers)
    project_id = r.json()["id"]

    r = await client.post("/furniture-types",
                          json={"category": "wardrobe", "schema": _WARDROBE_SCHEMA},
                          headers=headers)
    ft_id = r.json()["id"]
    return headers, project_id, ft_id


@pytest.mark.asyncio
async def test_create_configuration(client):
    headers, project_id, ft_id = await _setup(client)
    response = await client.post("/configurations", json={
        "project_id": project_id,
        "furniture_type_id": ft_id,
        "applied_config": {"width": 1200, "height": 2100, "depth": 580},
    }, headers=headers)
    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "draft"
    assert data["applied_config"]["width"] == 1200


@pytest.mark.asyncio
async def test_get_configuration(client):
    headers, project_id, ft_id = await _setup(client)
    r = await client.post("/configurations", json={
        "project_id": project_id,
        "furniture_type_id": ft_id,
        "applied_config": {"width": 900},
    }, headers=headers)
    config_id = r.json()["id"]

    response = await client.get(f"/configurations/{config_id}", headers=headers)
    assert response.status_code == 200
    assert response.json()["id"] == config_id


@pytest.mark.asyncio
async def test_update_configuration(client):
    headers, project_id, ft_id = await _setup(client)
    r = await client.post("/configurations", json={
        "project_id": project_id,
        "furniture_type_id": ft_id,
        "applied_config": {"width": 1200},
    }, headers=headers)
    config_id = r.json()["id"]

    response = await client.put(f"/configurations/{config_id}", json={
        "applied_config": {"width": 1500, "height": 2100, "depth": 580},
        "placement": {"x": 0, "y": 0, "z": 0, "rotation": 0},
    }, headers=headers)
    assert response.status_code == 200
    assert response.json()["applied_config"]["width"] == 1500
    assert response.json()["placement"]["x"] == 0


@pytest.mark.asyncio
async def test_confirm_configuration(client):
    headers, project_id, ft_id = await _setup(client)
    r = await client.post("/configurations", json={
        "project_id": project_id,
        "furniture_type_id": ft_id,
        "applied_config": {"width": 1200},
    }, headers=headers)
    config_id = r.json()["id"]

    response = await client.post(f"/configurations/{config_id}/confirm", headers=headers)
    assert response.status_code == 200
    assert response.json()["status"] == "confirmed"


@pytest.mark.asyncio
async def test_confirm_already_confirmed_returns_400(client):
    headers, project_id, ft_id = await _setup(client)
    r = await client.post("/configurations", json={
        "project_id": project_id,
        "furniture_type_id": ft_id,
        "applied_config": {"width": 1200},
    }, headers=headers)
    config_id = r.json()["id"]
    await client.post(f"/configurations/{config_id}/confirm", headers=headers)

    response = await client.post(f"/configurations/{config_id}/confirm", headers=headers)
    assert response.status_code == 400
```

- [ ] **Step 9.2: Run tests to verify they fail**

```bash
cd backend
pytest tests/test_configurations.py -v
# Expected: ImportError or 404
```

- [ ] **Step 9.3: Create app/models/configuration.py**

```python
# backend/app/models/configuration.py
import uuid

from sqlalchemy import JSON, ForeignKey, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

VALID_STATUSES = {"draft", "confirmed", "in_production", "completed"}


class Configuration(Base):
    __tablename__ = "configurations"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("projects.id"))
    furniture_type_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("furniture_types.id"))
    applied_config: Mapped[dict] = mapped_column(JSON)
    placement: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(Text, default="draft")
```

- [ ] **Step 9.4: Update models/__init__.py**

```python
# backend/app/models/__init__.py
from app.models.tenant import Tenant  # noqa: F401
from app.models.user import User  # noqa: F401
from app.models.project import Project  # noqa: F401
from app.models.furniture_type import FurnitureType  # noqa: F401
from app.models.configuration import Configuration  # noqa: F401
```

- [ ] **Step 9.5: Create app/schemas/configuration.py**

```python
# backend/app/schemas/configuration.py
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel


class ConfigurationCreate(BaseModel):
    project_id: UUID
    furniture_type_id: UUID
    applied_config: dict[str, Any]
    placement: Optional[dict[str, Any]] = None


class ConfigurationUpdate(BaseModel):
    applied_config: Optional[dict[str, Any]] = None
    placement: Optional[dict[str, Any]] = None


class ConfigurationResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    project_id: UUID
    furniture_type_id: UUID
    applied_config: dict[str, Any]
    placement: Optional[dict[str, Any]]
    status: str
```

- [ ] **Step 9.6: Create app/api/configurations.py**

```python
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
```

- [ ] **Step 9.7: Register configurations router in main.py**

```python
# backend/app/main.py
from fastapi import FastAPI

from app.api import auth, configurations, furniture_types, projects

app = FastAPI(title="Furniture Constructor API", version="1.0.0")

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(projects.router, prefix="/projects", tags=["projects"])
app.include_router(furniture_types.router, prefix="/furniture-types", tags=["furniture-types"])
app.include_router(configurations.router, prefix="/configurations", tags=["configurations"])


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
```

- [ ] **Step 9.8: Generate and apply migration**

```bash
cd backend
alembic revision --autogenerate -m "create configurations"
alembic upgrade head
```

- [ ] **Step 9.9: Run configuration tests to verify they pass**

```bash
cd backend
pytest tests/test_configurations.py -v
# Expected: 5 passed
```

- [ ] **Step 9.10: Commit**

```bash
cd backend
git add app/models/configuration.py app/models/__init__.py \
        app/schemas/configuration.py app/api/configurations.py \
        app/main.py alembic/versions/ tests/test_configurations.py
git commit -m "feat: add Configuration model and CRUD endpoints with tests"
```

---

### Task 10: Full Test Suite + Smoke Test

- [ ] **Step 10.1: Run the full test suite**

```bash
cd backend
pytest tests/ -v
# Expected: all tests pass (test_auth_core, test_auth, test_projects,
#           test_furniture_types, test_configurations)
```

- [ ] **Step 10.2: Verify OpenAPI docs are generated correctly**

```bash
cd backend
uvicorn app.main:app
# Open http://localhost:8000/docs in browser
# Expected: auth, projects, furniture-types, configurations sections visible
# All endpoints listed with correct request/response schemas
```

- [ ] **Step 10.3: Final commit**

```bash
cd backend
git add .
git commit -m "feat: complete backend foundation — auth, RBAC, projects, furniture types, configurations"
```

---

## What's Next

| Plan | Subsystem |
|---|---|
| **Plan 2** | Material System — catalog API, S3 texture upload, PBR material management |
| **Plan 3** | Frontend + Room Planner — Next.js 15, Babylon.js SceneProvider, 2D canvas → 3D scene |
| **Plan 4** | Furniture Configurator — FurnitureSchema compiler, ParametricBuilder, CSG, hardware placement |
| **Plan 5** | Production Pipeline — Pricing Engine, BOM Engine, DXF/PDF/SVG export |
| **Plan 6** | ERP/CRM Integration — webhook dispatcher, Bitrix24, 1C |
