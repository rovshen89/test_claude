# Furniture Constructor Platform — Handoff Document
**Last updated:** 2026-05-13
**Repo:** https://github.com/rovshen89/test_claude
**Branch:** `main` (all work committed directly to main)
**Total commits:** 212

---

## What This Project Is

A web-based B2B furniture configurator SaaS. Users create projects, configure furniture (dimensions, materials, slots), confirm configurations, generate DXF/PDF production files, and dispatch orders to a CRM via webhook. Designed for furniture manufacturers to offer parametric configuration + production pipeline to their clients.

Inspired by [b2b.pan-raspil.ru](https://b2b.pan-raspil.ru/) with a fuller stack: PBR 3D preview, multi-tenant material catalog, BOM engine, export pipeline, CRM bridge.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS |
| 3D viewer | Babylon.js (basic panel preview — see gaps) |
| Backend | FastAPI (Python 3.12), async |
| Auth | NextAuth v5 (frontend) + custom JWT (backend), RBAC |
| Database | PostgreSQL 16 via SQLAlchemy 2.0 async + asyncpg |
| Migrations | Alembic (5 migrations) |
| File storage | S3-compatible (boto3); local dev uses MinIO or moto mocks |
| DXF export | `ezdxf` |
| PDF export | `WeasyPrint` |
| CRM dispatch | HTTP webhook (configurable per tenant) |
| Containerization | Docker Compose (Postgres + MinIO + backend + frontend) |

---

## What Has Been Built (Sub-plans 1–20)

All 25 implementation plans have been executed. Zero unchecked tasks remain.

### Backend (sub-plans 1–4, 6)
- **Auth**: register, login, JWT, RBAC (admin / manufacturer / designer / consumer roles)
- **Projects**: CRUD, room schema JSONB storage, user ownership
- **Furniture Types**: CRUD, JSON schema storage per category
- **Configurations**: CRUD, status machine (`draft → confirmed → in_production → completed`), per-project scoping
- **Materials**: CRUD, PBR texture upload (ZIP with albedo/normal/roughness/AO), S3 storage, per-tenant + global catalog
- **Pricing engine**: panel area × price/m², edge banding, hardware, labour, tenant margin
- **BOM engine**: cut list with dimensions, grain direction, edge banding flags
- **Orders**: creation (triggers DXF + PDF export to S3), status, per-tenant `project_id` in response
- **Webhook/CRM dispatch**: POST to tenant-configured URL with configurable payload fields
- **Tenant settings**: GET/PUT `/tenants/me` — margin, webhook URL, CRM config
- **Backend tests**: 123 tests across 17 test files

### Frontend (sub-plans 5, 7–20)
All pages use Next.js 15 App Router with Server Components + Server Actions. No client-side API calls — all data fetching is server-side.

| Route | Description |
|---|---|
| `/login`, `/register` | Auth pages (NextAuth v5 credentials) |
| `/projects` | Projects list with "New Project" |
| `/projects/new` | Create project form |
| `/projects/[id]` | Project detail: room schema summary, configs grid, delete |
| `/projects/[id]/edit` | Rename project |
| `/projects/[id]/room-schema/edit` | Edit room schema (JSON textarea — see gaps) |
| `/projects/[id]/configurations/new` | Pick furniture type + set dimensions + assign panel materials |
| `/projects/[id]/configurations/[cfgId]` | 3D viewer (Babylon.js) + confirm/delete/download links |
| `/projects/[id]/configurations/[cfgId]/preview` | Pricing + BOM preview, Place Order button |
| `/projects/[id]/orders/[orderId]` | Order detail with DXF/PDF links + CRM dispatch button |
| `/configurations` | Global configurations list (all projects) with delete for drafts |
| `/orders` | Global orders list |
| `/materials` | Materials catalog list |
| `/materials/new` | Create material + upload PBR ZIP |
| `/materials/[matId]` | Material detail with inline edit |
| `/furniture-types` | Furniture types list |
| `/furniture-types/new` | Create furniture type with JSON schema editor |
| `/furniture-types/[ftId]` | Furniture type detail |
| `/furniture-types/[ftId]/edit` | Edit furniture type schema |
| `/settings` | Tenant webhook + CRM + margin config |
| `/dashboard` | Redirects to `/projects` (backward-compat shim) |

- **Frontend tests**: 57 Jest tests in `frontend/tests/lib/api.test.ts`

---

## What Is NOT Built (Gaps vs Master Design Spec)

These are features described in `docs/superpowers/specs/2026-04-08-furniture-constructor-design.md` that have not been implemented. They are the natural next areas of work.

### High Priority (core product gaps)

**1. 2D Room Planner Canvas**
The design spec describes an HTML5 Canvas + SVG overlay for visually drawing room walls, placing doors/windows, snapping to grid. The current implementation (`/projects/[id]/room-schema/edit`) is a **raw JSON textarea** — users paste room schema JSON manually. The visual drawing tool was never built.
- Design file: `docs/superpowers/specs/2026-04-08-furniture-constructor-design.md` → Module 1

**2. Full Parametric 3D Builder (BabylonScene)**
The current `BabylonScene.tsx` renders a simplified 6-panel box (left side, right side, top, bottom, back, one shelf) scaled from `width`/`height`/`depth`. It does **not** implement:
- The full `FurnitureSchema` slot system (`open | shelf | door_single | door_double | lift_up | drawer | pull_out | glass_insert`)
- CSG operations (handle cutouts, hinge pockets)
- Hardware mesh instances (hinges, handles, drawer slides)
- Column/row grid layout
- Rendering from actual `applied_config.panels[]` (the config form saves panel assignments but the viewer ignores them)

**3. PBR Texture Application in 3D Viewer**
`BabylonScene.tsx` uses hardcoded `PBRMaterial` colors (`albedoColor`). The material textures uploaded to S3 (albedo, normal, roughness, AO maps) are **never loaded in the viewer**. Each panel's `material_id` is stored in `applied_config` but the Babylon scene doesn't fetch or apply the actual S3 textures.

**4. Room Placement / Furniture-in-Room Scene**
No room 3D scene exists. The viewer shows furniture in isolation on a ground plane. The design spec describes placing confirmed furniture pieces into the 3D room scene (built from `RoomSchema`) with Havok physics collision and wall-snapping. This was never built.

### Medium Priority

**5. SVG Export / Panel Nesting**
The design spec lists SVG as a third export format — a cut optimization layout minimizing sheet waste via a nesting algorithm (`svgwrite` + custom nesting). Only DXF and PDF are implemented. `export_urls` currently only has `{ dxf, pdf }`.

**6. Zustand State Management**
The design spec listed Zustand for 3D scene state. The current implementation uses React `useState` throughout. Not a blocker for functionality but will be needed when the configurator becomes more complex (multi-piece room, undo/redo, shared state between 3D and sidebar).

**7. Redis**
Mentioned in the design for caching and WebSocket support. Not installed or used anywhere. No caching layer exists.

**8. Admin UI**
The `admin` role exists in the RBAC system but there are no admin-specific frontend pages. Admins can use the API directly but there's no UI for:
- Managing tenants
- Viewing/editing the global material library
- User management

**9. Manufacturer Role Distinction**
The manufacturer role exists but behaves identically to other roles in the frontend. The design spec describes a separate manufacturer portal for managing their catalog and receiving production orders.

---

## Project Structure

```
/
├── backend/
│   ├── app/
│   │   ├── api/          # FastAPI route handlers (auth, projects, configs, materials,
│   │   │                 #   furniture_types, pricing, bom, orders, tenants)
│   │   ├── core/         # Business logic (auth, pricing, bom, export_dxf, export_pdf,
│   │   │                 #   storage, webhook, pbr, deps)
│   │   ├── models/       # SQLAlchemy ORM models
│   │   ├── schemas/      # Pydantic request/response schemas
│   │   ├── config.py     # Settings (pydantic-settings, reads .env)
│   │   ├── database.py   # Async engine + session factory
│   │   └── main.py       # FastAPI app + router inclusion
│   ├── alembic/          # 5 migrations (tenants+users → projects+furniture_types+configs
│   │   │                 #   → materials → orders → last_dispatch)
│   │   └── versions/
│   ├── tests/            # 123 pytest-asyncio tests
│   ├── Dockerfile
│   ├── requirements.txt        # all deps (including test)
│   └── requirements-prod.txt  # runtime only (used by Dockerfile)
│
├── frontend/
│   ├── app/
│   │   ├── (app)/        # Authenticated routes (layout with nav)
│   │   │   ├── projects/
│   │   │   ├── configurations/
│   │   │   ├── orders/
│   │   │   ├── materials/
│   │   │   ├── furniture-types/
│   │   │   ├── settings/
│   │   │   └── _components/  # Shared: DeleteButton, etc.
│   │   ├── (auth)/       # Unauthenticated routes (login, register)
│   │   ├── actions/      # Server Actions (projects.ts, configurations.ts, orders.ts,
│   │   │                 #   materials.ts, furniture_types.ts, tenants.ts)
│   │   └── api/auth/     # NextAuth route handler
│   ├── lib/
│   │   ├── api.ts        # All typed API fetch functions + TypeScript types
│   │   └── auth.ts       # NextAuth config (credentials provider → backend JWT)
│   ├── middleware.ts      # Auth middleware (protects /projects/*, /dashboard/*)
│   ├── tests/            # 57 Jest tests for api.ts functions
│   ├── Dockerfile
│   └── next.config.ts    # output: "standalone" (for Docker)
│
├── docker-compose.yml    # postgres + minio + createbuckets + migrate + backend + frontend
├── .env.example          # Template for docker-compose .env
└── docs/superpowers/
    ├── specs/            # 23 design specs
    └── plans/            # 25 implementation plans (all completed)
```

---

## Key Files

| File | Why It Matters |
|---|---|
| `backend/app/api/orders.py` | Most complex endpoint — creates order, generates DXF+PDF, uploads to S3, stores URLs |
| `backend/app/core/pricing.py` | Pricing engine pure function |
| `backend/app/core/bom.py` | BOM engine pure function |
| `backend/app/core/export_dxf.py` | DXF panel drawing via ezdxf |
| `backend/app/core/export_pdf.py` | PDF generation via WeasyPrint |
| `backend/app/core/webhook.py` | CRM payload builder + dispatch |
| `frontend/lib/api.ts` | All API types + fetch functions — the frontend's contract with the backend |
| `frontend/app/(app)/layout.tsx` | App shell: nav links, sign-out |
| `frontend/app/(app)/projects/[id]/configurations/[cfgId]/_components/BabylonScene.tsx` | 3D viewer — main area for future 3D work |
| `docs/superpowers/specs/2026-04-08-furniture-constructor-design.md` | Master product design spec — the source of truth for what this should eventually be |

---

## Running Locally (macOS, no Docker)

**Prerequisites:** PostgreSQL running, MinIO running (or skip for no export)

```bash
# Backend
cd backend
pip install -r requirements.txt
# Create backend/.env:
#   DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost/furniture_constructor
#   SECRET_KEY=<openssl rand -base64 32>
#   S3_BUCKET=furniture-constructor
#   S3_ACCESS_KEY=minioadmin / S3_SECRET_KEY=minioadmin
#   S3_ENDPOINT_URL=http://localhost:9000
alembic upgrade head
uvicorn app.main:app --reload

# Frontend (new terminal)
cd frontend
# Create frontend/.env.local:
#   AUTH_SECRET=<openssl rand -base64 32>
#   AUTH_URL=http://localhost:3000
#   BACKEND_URL=http://localhost:8000
npm install
npm run dev
```

Open `http://localhost:3000`.

---

## Running on Ubuntu Server (Docker, accessible from MacBook on LAN)

```bash
# On Ubuntu machine:
# 1. Install Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker

# 2. Clone repo
git clone https://github.com/rovshen89/test_claude.git && cd test_claude

# 3. Check for port conflicts (3000, 8000, 9001)
ss -tlnp | grep -E ':3000|:8000|:9001'
# If any are taken, set FRONTEND_PORT / BACKEND_PORT / MINIO_CONSOLE_PORT in .env

# 4. Create .env (auto-fills secrets and IP)
cat > .env << EOF
SECRET_KEY=$(openssl rand -base64 32)
AUTH_SECRET=$(openssl rand -base64 32)
AUTH_URL=http://$(ip addr show | grep "inet " | grep -v 127 | awk '{print $2}' | cut -d/ -f1 | head -1):3000
FRONTEND_PORT=3000
BACKEND_PORT=8000
MINIO_CONSOLE_PORT=9001
EOF

# 5. Build and start
docker compose up --build -d

# 6. Watch logs
docker compose logs -f
```

Open `http://<ubuntu-ip>:3000` from MacBook.

**Notes:**
- Postgres and MinIO are internal only — no host ports exposed for them.
- `migrate` and `createbuckets` are one-shot init containers — they exit with code 0 on success.
- All data is persisted in Docker volumes (`postgres_data`, `minio_data`). `docker compose down -v` wipes them.

---

## Running Tests

```bash
# Backend (123 tests)
cd backend
pip install -r requirements.txt
pytest

# Frontend (57 tests)
cd frontend
npm install
npm test
```

---

## Environment Variables Reference

### Backend (`backend/.env`)

| Variable | Default | Required |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://postgres:postgres@localhost/furniture_constructor` | Yes |
| `SECRET_KEY` | `change-me-in-production-replace-this-key` (insecure) | Yes in prod |
| `S3_BUCKET` | `furniture-constructor` | Yes for export |
| `S3_ACCESS_KEY` | `test` | Yes for export |
| `S3_SECRET_KEY` | `test` | Yes for export |
| `S3_ENDPOINT_URL` | `None` (real AWS) | Set for MinIO |
| `AWS_REGION` | `us-east-1` | No |

### Frontend (`frontend/.env.local`)

| Variable | Description |
|---|---|
| `AUTH_SECRET` | NextAuth signing secret — must be set |
| `AUTH_URL` | Full URL of the frontend (e.g. `http://localhost:3000`) — required outside Vercel |
| `BACKEND_URL` | FastAPI base URL — no trailing slash |

---

## Enterprise Implementation Plans

Two strategic documents live in `docs/` for the next phase of development:

| File | Description |
|---|---|
| `docs/enterprise-implementation-plan.md` | 1,400-line enterprise architecture plan (v2.0, May 2026). Covers scene-centric domain model, 6-phase delivery, Zustand store slices, GLB/USDZ/AR pipeline, worker service, Redis, optimistic locking, and all bottlenecks/mitigations. |
| `docs/3d-designer-spec.md` | Detailed UX spec for the full 3D designer experience (inspired by Flatma). 12 feature areas with file-level task breakdowns, effort estimates (67 days total), and recommended build order across 5 phases. |

The enterprise plan's recommended immediate next steps (Section 22):
1. Finalize the scene/configuration/order source-of-truth decision
2. Write the `SceneObject` and `ProjectScene` schemas
3. Add backend derivation tests for one-object scene parity with existing config flow
4. Spike USDZ conversion in Docker before committing to iOS AR
5. Implement scene backend behind a feature flag
6. Refactor Babylon scale to `0.001` (currently uses raw mm values)
7. Build the editor core only after backend scene contracts are stable

---

## Suggested Next Steps

Priority order based on what's most visible to users:

1. **Visual room planner** — replace the JSON textarea at `/projects/[id]/room-schema/edit` with an HTML5 Canvas drawing tool. This is the largest UX gap between what's built and what the product spec describes. See `docs/3d-designer-spec.md` → Feature Area 1 (Room Setup) and Feature Area 8 (2D Floor Plan).

2. **Full parametric 3D builder** — extend `BabylonScene.tsx` to render from `applied_config.panels[]` with the correct per-panel dimensions from `FurnitureSchema`. Apply S3 material textures to each panel using the stored `material_id`. See `docs/3d-designer-spec.md` → Feature Areas 3–5, 11.

3. **SVG panel nesting export** — add a third export format to the order pipeline. `export_urls` already has the `dxf`/`pdf` shape; add `svg`. See `docs/3d-designer-spec.md` → Feature Area 9 (Cutting Layout).

4. **Admin UI** — pages under `/admin` for tenant management, global material library, user overview.

5. **Zustand + scene store** — once the 3D configurator grows in complexity, add Zustand for shared state between the canvas, sidebar controls, and panel assignment list. See `docs/enterprise-implementation-plan.md` → Section 8 (Frontend Architecture) for the full 7-slice store design.
