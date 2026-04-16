# Frontend 3D Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-configuration 3D viewer page at `/projects/[id]/configurations/[cfgId]` with real-time Babylon.js mesh updates and dimension editing for confirmed configurations.

**Architecture:** Server Component shell fetches project + configuration + furniture type, guards draft redirect, passes data to a Client Component (`ConfigurationViewer`) that owns dimension state and dynamically imports a `BabylonScene` (ssr:false) component for WebGL rendering. Confirmed configurations allow editing; in_production and completed are read-only.

**Tech Stack:** Next.js 15 App Router, NextAuth v5, Tailwind CSS, `@babylonjs/core` (npm), Server Components + Server Actions, Jest unit tests.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `frontend/lib/api.ts` | Modify | Add `getConfiguration`, `updateConfiguration` |
| `frontend/tests/lib/api.test.ts` | Modify | Add 4 tests for the two new helpers |
| `frontend/app/actions/configurations.ts` | Modify | Add `updateConfigurationAction` |
| `frontend/app/(app)/projects/[id]/page.tsx` | Modify | Add "View in 3D" link to non-draft cards |
| `frontend/app/(app)/projects/[id]/configurations/new/_components/ConfigurationForm.tsx` | Modify | Remove step validation, update hint text, remove `step` prop |
| `frontend/app/(app)/projects/[id]/configurations/[cfgId]/_components/BabylonScene.tsx` | Create | Client Component — Babylon.js WebGL canvas (ssr:false target) |
| `frontend/app/(app)/projects/[id]/configurations/[cfgId]/_components/ConfigurationViewer.tsx` | Create | Client Component — sidebar controls + dynamic BabylonScene import |
| `frontend/app/(app)/projects/[id]/configurations/[cfgId]/page.tsx` | Create | Server Component shell — auth + parallel data fetch |

---

### Task 1: API helpers — `getConfiguration` and `updateConfiguration`

**Files:**
- Modify: `frontend/lib/api.ts`
- Modify: `frontend/tests/lib/api.test.ts`

---

- [ ] **Step 1: Write 4 failing tests**

Add to the bottom of `frontend/tests/lib/api.test.ts`.

First, add `getConfiguration` and `updateConfiguration` to the import at line 1:

```ts
import {
  ApiError,
  getProjects,
  getProject,
  createProject,
  listConfigurations,
  getFurnitureType,
  getFurnitureTypes,
  createConfiguration,
  confirmConfiguration,
  getConfiguration,
  updateConfiguration,
} from "@/lib/api"
```

Then append these test suites to the end of the file:

```ts
describe("getConfiguration", () => {
  it("calls GET /configurations/{id} with Authorization header and returns Configuration", async () => {
    const fixture = {
      id: "cfg1",
      project_id: "p1",
      furniture_type_id: "ft1",
      applied_config: { width: 900 },
      placement: null,
      status: "confirmed",
    }
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => fixture })

    const result = await getConfiguration("tok", "cfg1")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/configurations/cfg1",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      })
    )
    expect(result.id).toBe("cfg1")
    expect(result.status).toBe("confirmed")
  })

  it("throws ApiError on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, text: async () => "not found" })
    await expect(getConfiguration("tok", "missing")).rejects.toMatchObject({ status: 404 })
  })
})

describe("updateConfiguration", () => {
  it("calls PUT /configurations/{id} with applied_config body and Authorization header", async () => {
    const fixture = {
      id: "cfg1",
      project_id: "p1",
      furniture_type_id: "ft1",
      applied_config: { width: 1000, height: 720, depth: 300 },
      placement: null,
      status: "draft",
    }
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => fixture })

    const result = await updateConfiguration("tok", "cfg1", { width: 1000, height: 720, depth: 300 })

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/configurations/cfg1",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ applied_config: { width: 1000, height: 720, depth: 300 } }),
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      })
    )
    expect(result.id).toBe("cfg1")
  })

  it("throws ApiError on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => "Only draft configurations can be modified",
    })
    await expect(
      updateConfiguration("tok", "cfg1", { width: 900 })
    ).rejects.toMatchObject({ status: 400 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx jest tests/lib/api.test.ts --no-coverage 2>&1 | tail -20
```

Expected: 4 failures — `getConfiguration is not a function` / `updateConfiguration is not a function`.

- [ ] **Step 3: Implement `getConfiguration` and `updateConfiguration` in `lib/api.ts`**

Append to the end of `frontend/lib/api.ts`:

```ts
export async function getConfiguration(token: string, configId: string): Promise<Configuration> {
  return apiFetch<Configuration>(`/configurations/${configId}`, token)
}

export async function updateConfiguration(
  token: string,
  configId: string,
  appliedConfig: Record<string, number>
): Promise<Configuration> {
  return apiFetch<Configuration>(`/configurations/${configId}`, token, {
    method: "PUT",
    body: JSON.stringify({ applied_config: appliedConfig }),
  })
}
```

- [ ] **Step 4: Run tests to verify all 20 pass**

```bash
cd frontend && npx jest tests/lib/api.test.ts --no-coverage 2>&1 | tail -10
```

Expected: `Tests: 20 passed, 20 total`

- [ ] **Step 5: Commit**

```bash
cd frontend && git add lib/api.ts tests/lib/api.test.ts
git commit -m "feat: add getConfiguration and updateConfiguration API helpers"
```

---

### Task 2: Server Action — `updateConfigurationAction`

**Files:**
- Modify: `frontend/app/actions/configurations.ts`

---

- [ ] **Step 1: Add `updateConfiguration` to the import and add the action**

Replace the import line in `frontend/app/actions/configurations.ts`:

```ts
import { createConfiguration, confirmConfiguration, updateConfiguration, ApiError } from "@/lib/api"
```

Then append the new action at the end of the file:

```ts
export async function updateConfigurationAction(
  configId: string,
  projectId: string,
  appliedConfig: Record<string, number>
): Promise<{ error: string }> {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token
  if (!configId || !projectId) return { error: "Invalid request" }
  try {
    await updateConfiguration(token, configId, appliedConfig)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    if (e instanceof ApiError) return { error: e.message }
    throw e
  }
  revalidatePath(`/projects/${projectId}`)
  redirect(`/projects/${projectId}`)
}
```

Note: The return type is `Promise<{ error: string }>` — success path always calls `redirect()` which throws internally and never returns. A 400 from the backend (e.g. "Only draft configurations can be modified") surfaces as `{ error: e.message }` and will show as an error banner in the viewer.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output (zero errors).

- [ ] **Step 3: Commit**

```bash
cd frontend && git add app/actions/configurations.ts
git commit -m "feat: add updateConfigurationAction server action"
```

---

### Task 3: Project page links + ConfigurationForm step fix

**Files:**
- Modify: `frontend/app/(app)/projects/[id]/page.tsx`
- Modify: `frontend/app/(app)/projects/[id]/configurations/new/_components/ConfigurationForm.tsx`

---

- [ ] **Step 1: Add "View in 3D" links to non-draft cards in `page.tsx`**

In `frontend/app/(app)/projects/[id]/page.tsx`, replace the existing draft-only button block:

```tsx
              {cfg.status === "draft" && (
                <div className="mt-3 flex justify-end">
                  <ConfirmButton configId={cfg.id} projectId={id} />
                </div>
              )}
```

with:

```tsx
              <div className="mt-3 flex justify-end gap-3">
                {cfg.status === "draft" && (
                  <ConfirmButton configId={cfg.id} projectId={id} />
                )}
                {cfg.status !== "draft" && (
                  <Link
                    href={`/projects/${id}/configurations/${cfg.id}`}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                  >
                    View in 3D →
                  </Link>
                )}
              </div>
```

- [ ] **Step 2: Remove step validation from `ConfigurationForm.tsx`**

In `frontend/app/(app)/projects/[id]/configurations/new/_components/ConfigurationForm.tsx`:

**Change line 61** — replace the step validation condition:

Old:
```ts
      if (val < spec.min || val > spec.max || (spec.step > 0 && (val - spec.min) % spec.step !== 0)) {
        newErrors[key] = `Must be between ${spec.min} and ${spec.max} mm (step ${spec.step})`
```

New:
```ts
      if (val < spec.min || val > spec.max) {
        newErrors[key] = `Must be between ${spec.min} and ${spec.max} mm`
```

**Change line 128** — remove `step={spec.step}` from the number input, replacing it with `step={1}`:

Old:
```tsx
                    step={spec.step}
```

New:
```tsx
                    step={1}
```

**Change line 134** — update the hint text:

Old:
```tsx
                  <p className="text-xs text-slate-600 mt-1">
                    {spec.min} – {spec.max}, step {spec.step}
                  </p>
```

New:
```tsx
                  <p className="text-xs text-slate-600 mt-1">
                    {spec.min} – {spec.max} mm
                  </p>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output.

- [ ] **Step 4: Run tests to confirm nothing broke**

```bash
cd frontend && npx jest --no-coverage 2>&1 | tail -10
```

Expected: 20 passed.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add app/\(app\)/projects/\[id\]/page.tsx app/\(app\)/projects/\[id\]/configurations/new/_components/ConfigurationForm.tsx
git commit -m "feat: add View in 3D links to project cards; remove step validation from ConfigurationForm"
```

---

### Task 4: Install Babylon.js + create BabylonScene component

**Files:**
- Modify: `frontend/package.json` (via npm install)
- Create: `frontend/app/(app)/projects/[id]/configurations/[cfgId]/_components/BabylonScene.tsx`

---

- [ ] **Step 1: Install `@babylonjs/core`**

```bash
cd frontend && npm install @babylonjs/core
```

Expected: package added to `dependencies` in `package.json`.

- [ ] **Step 2: Create directory and BabylonScene component**

Create `frontend/app/(app)/projects/[id]/configurations/[cfgId]/_components/BabylonScene.tsx`:

```tsx
"use client"

import { useEffect, useRef, useState } from "react"
import {
  Engine,
  Scene,
  ArcRotateCamera,
  Vector3,
  HemisphericLight,
  DirectionalLight,
  ShadowGenerator,
  MeshBuilder,
  PBRMaterial,
  StandardMaterial,
  Color3,
  Color4,
  type Mesh,
} from "@babylonjs/core"

type DimensionSpec = { min: number; max: number; step: number; default: number }
type Schema = { dimensions?: Record<string, DimensionSpec> }

type Props = {
  dimensions: Record<string, number>
  schema: Record<string, unknown>
}

export default function BabylonScene({ dimensions, schema }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<Engine | null>(null)
  const sceneRef = useRef<Scene | null>(null)
  const cameraRef = useRef<ArcRotateCamera | null>(null)
  const shadowGenRef = useRef<ShadowGenerator | null>(null)
  const woodMatRef = useRef<PBRMaterial | null>(null)
  const edgeMatRef = useRef<PBRMaterial | null>(null)
  const meshesRef = useRef<Mesh[]>([])
  const [webGLUnsupported, setWebGLUnsupported] = useState(false)

  // Mount once: create engine, scene, camera, lights, materials
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let engine: Engine
    try {
      engine = new Engine(canvas, true)
    } catch {
      setWebGLUnsupported(true)
      return
    }

    const scene = new Scene(engine)
    scene.clearColor = new Color4(0.025, 0.05, 0.11, 1)

    const camera = new ArcRotateCamera("cam", -Math.PI / 4, Math.PI / 3.2, 7, new Vector3(0, 1, 0), scene)
    camera.attachControl(canvas, true)
    camera.lowerRadiusLimit = 2
    camera.upperRadiusLimit = 20
    camera.wheelPrecision = 60

    const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene)
    hemi.intensity = 0.45
    hemi.groundColor = new Color3(0.04, 0.07, 0.14)

    const dir = new DirectionalLight("dir", new Vector3(-1, -2, -1), scene)
    dir.intensity = 1.1
    dir.position = new Vector3(4, 8, 4)

    const shadowGen = new ShadowGenerator(1024, dir)
    shadowGen.useBlurExponentialShadowMap = true

    const ground = MeshBuilder.CreateGround("ground", { width: 14, height: 14 }, scene)
    const gm = new StandardMaterial("groundMat", scene)
    gm.diffuseColor = new Color3(0.05, 0.09, 0.16)
    gm.specularColor = new Color3(0, 0, 0)
    ground.material = gm
    ground.receiveShadows = true

    const woodMat = new PBRMaterial("wood", scene)
    woodMat.albedoColor = new Color3(0.75, 0.6, 0.44)
    woodMat.metallic = 0
    woodMat.roughness = 0.65

    const edgeMat = new PBRMaterial("edge", scene)
    edgeMat.albedoColor = new Color3(0.55, 0.42, 0.28)
    edgeMat.metallic = 0
    edgeMat.roughness = 0.85

    engineRef.current = engine
    sceneRef.current = scene
    cameraRef.current = camera
    shadowGenRef.current = shadowGen
    woodMatRef.current = woodMat
    edgeMatRef.current = edgeMat

    engine.runRenderLoop(() => scene.render())
    const handleResize = () => engine.resize()
    window.addEventListener("resize", handleResize)

    return () => {
      window.removeEventListener("resize", handleResize)
      engine.dispose()
    }
  }, [])

  // Rebuild mesh whenever dimensions change
  useEffect(() => {
    const scene = sceneRef.current
    const shadowGen = shadowGenRef.current
    const camera = cameraRef.current
    const woodMat = woodMatRef.current
    const edgeMat = edgeMatRef.current
    if (!scene || !shadowGen || !camera || !woodMat || !edgeMat) return

    meshesRef.current.forEach((m) => m.dispose())
    meshesRef.current = []

    const schemaCast = schema as Schema
    const dimSpecs = schemaCast.dimensions ?? {}

    const w = dimensions.width ?? dimSpecs.width?.default ?? 900
    const h = dimensions.height ?? dimSpecs.height?.default ?? 720
    const d = dimensions.depth ?? dimSpecs.depth?.default ?? 300

    const SCALE = 0.003
    const sw = w * SCALE
    const sh = h * SCALE
    const sd = d * SCALE
    const pt = 0.054

    function addPanel(
      name: string,
      sx: number,
      sy: number,
      sz: number,
      px: number,
      py: number,
      pz: number,
      mat?: PBRMaterial
    ) {
      const box = MeshBuilder.CreateBox(name, { width: sx, height: sy, depth: sz }, scene!)
      box.position.set(px, py, pz)
      box.material = mat ?? woodMat!
      box.receiveShadows = true
      shadowGen!.addShadowCaster(box)
      meshesRef.current.push(box)
    }

    const yb = sh / 2
    addPanel("left",   pt,        sh - pt * 2, sd,       -sw / 2 + pt / 2, yb,         0)
    addPanel("right",  pt,        sh - pt * 2, sd,        sw / 2 - pt / 2, yb,         0)
    addPanel("top",    sw,        pt,          sd,         0,               sh + pt / 2, 0)
    addPanel("bottom", sw,        pt,          sd,         0,               pt / 2,      0)
    addPanel("back",   sw - pt*2, sh,          pt * 0.4,   0,               yb,         -sd / 2 + pt * 0.2, edgeMat)
    if (sh > 0.45) {
      addPanel("shelf", sw - pt*2, pt, sd - pt, 0, sh * 0.55, pt * 0.4)
    }

    camera.target = new Vector3(0, sh / 2, 0)
  }, [dimensions, schema])

  if (webGLUnsupported) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-slate-950">
        <p className="text-slate-400 text-sm">3D preview not supported in this browser.</p>
      </div>
    )
  }

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full outline-none block" />
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd frontend && git add package.json package-lock.json app/\(app\)/projects/\[id\]/configurations/\[cfgId\]/_components/BabylonScene.tsx
git commit -m "feat: install @babylonjs/core and add BabylonScene WebGL component"
```

---

### Task 5: Create ConfigurationViewer client component

**Files:**
- Create: `frontend/app/(app)/projects/[id]/configurations/[cfgId]/_components/ConfigurationViewer.tsx`

---

- [ ] **Step 1: Create ConfigurationViewer.tsx**

Create `frontend/app/(app)/projects/[id]/configurations/[cfgId]/_components/ConfigurationViewer.tsx`:

```tsx
"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { updateConfigurationAction } from "@/app/actions/configurations"
import type { Configuration, FurnitureType } from "@/lib/api"

const BabylonSceneDynamic = dynamic(() => import("./BabylonScene"), { ssr: false })

type DimensionSpec = { min: number; max: number; step: number; default: number }
type Schema = { dimensions?: Record<string, DimensionSpec> }

type Props = {
  configuration: Configuration
  furnitureType: FurnitureType
  projectId: string
  isReadOnly: boolean
}

function statusColors(status: string): string {
  switch (status) {
    case "draft":         return "bg-cyan-950 text-cyan-300"
    case "confirmed":     return "bg-blue-950 text-blue-300"
    case "in_production": return "bg-amber-950 text-amber-300"
    case "completed":     return "bg-green-950 text-green-400"
    default:              return "bg-slate-800 text-slate-400"
  }
}

export function ConfigurationViewer({ configuration, furnitureType, projectId, isReadOnly }: Props) {
  const savedDimensions = configuration.applied_config as Record<string, number>
  const [dimensions, setDimensions] = useState<Record<string, number>>(savedDimensions)
  const [inputErrors, setInputErrors] = useState<Record<string, string>>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const schema = furnitureType.schema as Schema
  const dimSpecs = schema.dimensions ?? {}

  const hasUnsavedChanges = Object.keys(dimSpecs).some(
    (key) => dimensions[key] !== savedDimensions[key]
  )
  const hasInputErrors = Object.keys(inputErrors).length > 0

  function handleSliderChange(key: string, value: number) {
    setDimensions((prev) => ({ ...prev, [key]: value }))
    setInputErrors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  function handleInputChange(key: string, raw: string, spec: DimensionSpec) {
    const num = Number(raw)
    if (!Number.isFinite(num) || num < spec.min || num > spec.max) {
      setInputErrors((prev) => ({
        ...prev,
        [key]: `Must be between ${spec.min} and ${spec.max} mm`,
      }))
      return
    }
    setInputErrors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    setDimensions((prev) => ({ ...prev, [key]: num }))
  }

  function handleReset() {
    setDimensions(savedDimensions)
    setInputErrors({})
    setSaveError(null)
  }

  async function handleSave() {
    if (hasInputErrors) return
    setIsSaving(true)
    setSaveError(null)
    const result = await updateConfigurationAction(configuration.id, projectId, dimensions)
    if (result?.error) {
      setSaveError(result.error)
      setIsSaving(false)
    }
    // On success, updateConfigurationAction calls redirect() — no further state update needed
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)] overflow-hidden">
      {/* Viewer header */}
      <div className="bg-slate-800 border-b border-slate-700 px-5 h-12 flex items-center justify-between flex-shrink-0">
        <Link href={`/projects/${projectId}`} className="text-xs text-indigo-400 hover:text-indigo-300">
          ← Back to project
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-100">{furnitureType.category}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors(configuration.status)}`}>
            {configuration.status}
          </span>
        </div>
        <span className="text-xs text-slate-500">orbit · pan · zoom</span>
      </div>

      {/* Canvas + sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* 3D canvas area */}
        <div className="flex-1 relative bg-slate-950">
          <BabylonSceneDynamic dimensions={dimensions} schema={furnitureType.schema} />
        </div>

        {/* Sidebar */}
        <div className="w-64 bg-slate-950 border-l border-slate-800 p-4 flex flex-col gap-3 overflow-y-auto flex-shrink-0">
          <p className="text-xs uppercase tracking-widest text-slate-500">Dimensions</p>

          {Object.entries(dimSpecs).map(([key, spec]) => (
            <div key={key} className="mb-1">
              <span className="block text-xs text-slate-400 mb-1.5 capitalize">{key} (mm)</span>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={spec.min}
                  max={spec.max}
                  step={1}
                  value={dimensions[key] ?? spec.default}
                  disabled={isReadOnly}
                  onChange={(e) => handleSliderChange(key, Number(e.target.value))}
                  className="flex-1 h-1 rounded accent-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                />
                <input
                  type="number"
                  defaultValue={dimensions[key] ?? spec.default}
                  key={`${key}-${dimensions[key]}`}
                  disabled={isReadOnly}
                  onBlur={(e) => handleInputChange(key, e.target.value, spec)}
                  className={`w-20 bg-slate-800 border rounded-md px-2 py-1.5 text-xs font-semibold text-right text-slate-100 outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
                    inputErrors[key]
                      ? "border-red-500 text-red-400"
                      : "border-slate-700 focus:border-indigo-500"
                  }`}
                />
              </div>
              <div className="flex justify-between text-xs text-slate-700 mt-1">
                <span>{spec.min}</span>
                <span>{spec.max}</span>
              </div>
              {inputErrors[key] && (
                <p className="text-xs text-red-400 mt-1">{inputErrors[key]}</p>
              )}
            </div>
          ))}

          <hr className="border-slate-800" />

          {isReadOnly && (
            <div className="bg-green-950 border border-green-900 rounded-md px-3 py-2 text-xs text-green-400">
              This configuration is <strong>{configuration.status}</strong> — dimensions are locked.
              Orbit and zoom are still available.
            </div>
          )}

          {!isReadOnly && hasUnsavedChanges && (
            <>
              <div className="bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-xs text-slate-400">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 mr-1.5 align-middle" />
                Unsaved changes
              </div>
              <div className="bg-blue-950 border border-blue-900 rounded-md px-3 py-2 text-xs text-blue-300">
                <strong>Editing confirmed config</strong> — saving resets status to draft.
                Re-confirm from the project page.
              </div>
            </>
          )}

          {saveError && (
            <div className="bg-red-950 border border-red-900 rounded-md px-3 py-2 text-xs text-red-400">
              {saveError}
            </div>
          )}

          {!isReadOnly && (
            <>
              <button
                onClick={handleSave}
                disabled={isSaving || hasInputErrors}
                className="w-full py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
              >
                {isSaving ? "Saving…" : "Save as draft"}
              </button>
              <button
                onClick={handleReset}
                disabled={isSaving || !hasUnsavedChanges}
                className="w-full py-2 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 text-sm font-medium transition-colors"
              >
                Reset to saved
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
```

Note on the number input: it uses `defaultValue` + `key` (forces remount when slider changes) + `onBlur` validation. This allows typing freely without every keystroke triggering validation, while keeping the input in sync when sliders change.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd frontend && git add app/\(app\)/projects/\[id\]/configurations/\[cfgId\]/_components/ConfigurationViewer.tsx
git commit -m "feat: add ConfigurationViewer client component with dimension controls"
```

---

### Task 6: Create Server Component page shell

**Files:**
- Create: `frontend/app/(app)/projects/[id]/configurations/[cfgId]/page.tsx`

---

- [ ] **Step 1: Create the page**

Create `frontend/app/(app)/projects/[id]/configurations/[cfgId]/page.tsx`:

```tsx
import { auth } from "@/lib/auth"
import {
  getProject,
  getConfiguration,
  getFurnitureType,
  ApiError,
  type Project,
  type Configuration,
  type FurnitureType,
} from "@/lib/api"
import { redirect, notFound } from "next/navigation"
import { ConfigurationViewer } from "./_components/ConfigurationViewer"

export default async function ConfigurationViewerPage({
  params,
}: {
  params: Promise<{ id: string; cfgId: string }>
}) {
  const { id, cfgId } = await params
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token

  // Fetch project and configuration in parallel
  let project!: Project
  let configuration!: Configuration
  try {
    ;[project, configuration] = await Promise.all([
      getProject(token, id),
      getConfiguration(token, cfgId),
    ])
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound()
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    throw e
  }

  // Drafts have no viewer — redirect back to project
  if (configuration.status === "draft") redirect(`/projects/${id}`)

  // Fetch furniture type now that we have the ID from the configuration
  let furnitureType!: FurnitureType
  try {
    furnitureType = await getFurnitureType(token, configuration.furniture_type_id)
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound()
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    throw e
  }

  const isReadOnly =
    configuration.status === "in_production" || configuration.status === "completed"

  // Suppress the (app) layout's p-6 padding so ConfigurationViewer can fill the viewport
  return (
    <div className="-m-6">
      <ConfigurationViewer
        configuration={configuration}
        furnitureType={furnitureType}
        projectId={id}
        isReadOnly={isReadOnly}
      />
    </div>
  )
}
```

Note: `project` is fetched to validate ownership (the backend 404s on a project the user doesn't own) but is not used in rendering — this is intentional.

Note: The `(app)` layout wraps children in `<main className="p-6">`. The `-m-6` wrapper on this page cancels that padding so the full-height viewer can flush against the viewport edges. `ConfigurationViewer` uses `h-[calc(100vh-3rem)]` to fill exactly the remaining height below the 48px (`h-12`) app nav.

- [ ] **Step 2: Run full test suite**

```bash
cd frontend && npx jest --no-coverage 2>&1 | tail -10
```

Expected: `Tests: 20 passed, 20 total`

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd frontend && git add app/\(app\)/projects/\[id\]/configurations/\[cfgId\]/page.tsx
git commit -m "feat: add configuration viewer page — Server Component shell with auth and data fetching"
```

---

## Self-Review Notes

**Spec coverage check:**
- ✅ `getConfiguration` + `updateConfiguration` API helpers with 4 tests
- ✅ `updateConfigurationAction` — 401 redirects, other ApiError returns `{ error }`, success redirects
- ✅ "View in 3D" links on confirmed/in_production/completed cards only
- ✅ Draft cards unchanged (Confirm button only)
- ✅ ConfigurationForm step validation removed; hint text updated; `step` prop set to 1
- ✅ BabylonScene: mount once (engine/scene/camera/lights/materials), rebuild on dimensions change, WebGL fallback, cleanup on unmount
- ✅ ConfigurationViewer: dimension state from `applied_config as Record<string, number>`, slider+input per key, isReadOnly disables all, unsaved-changes banner, save calls action
- ✅ Viewer page: auth guard, 404/401 handling, draft redirect, `isReadOnly` derived from status
- ✅ JWT stays server-side — data fetched in Server Component, mutations via Server Action
- ✅ No E2E tests (deferred per spec)
- ✅ No room placement, no Zustand, no PBR textures from catalog

**Type consistency:**
- `DimensionSpec` defined identically in BabylonScene and ConfigurationViewer (no shared module — both are in the same `_components` folder; acceptable for this scope)
- `Schema` cast pattern consistent: `furnitureType.schema as Schema` in ConfigurationViewer; `schema as Schema` in BabylonScene
- `updateConfigurationAction` imported in ConfigurationViewer — correct path `@/app/actions/configurations`

**Potential issues to watch:**
- Number input uses `defaultValue` + `key` remount pattern. This means when the slider changes, the input re-renders to the new value. The `onBlur` handler validates on leaving the field. This is the most reliable uncontrolled-to-controlled bridge for this use case.
- `@babylonjs/core` is a large package (~5MB+). Babylon.js is only ever loaded client-side (dynamic `ssr:false`), so it does not affect server bundle size or SSR. It will increase the client chunk for the viewer route — this is expected and acceptable.
- If `schema.dimensions` keys are not `width`/`height`/`depth`, the BabylonScene falls back to those keys' `default` values from the schema. Keys with other names won't map to `w`/`h`/`d` directly. The current implementation reads `dimensions.width`, `dimensions.height`, `dimensions.depth` specifically. If the schema uses different key names (e.g. `largeur`, `hauteur`), the mesh will use defaults. This is acceptable for this sub-plan scope.
