"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { updateConfigurationAction } from "@/app/actions/configurations"
import { createOrderAction } from "@/app/actions/orders"
import type { Configuration, FurnitureType, AppliedConfig, Material } from "@/lib/api"

const BabylonSceneDynamic = dynamic(() => import("./BabylonScene"), { ssr: false })

type DimensionSpec = { min: number; max: number; step: number; default: number }
type PanelTemplate = {
  name: string
  width_key: string
  height_key: string
  quantity?: number
  grain_direction?: string
  edge_banding?: { left?: boolean; right?: boolean; top?: boolean; bottom?: boolean }
}
type Schema = { dimensions?: Record<string, DimensionSpec>; panels?: PanelTemplate[] }

type PanelAssignment = { materialId: string | null; thickness_mm: number | null }

type Props = {
  configuration: Configuration
  furnitureType: FurnitureType
  projectId: string
  isReadOnly: boolean
  materials: Material[]
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

export function ConfigurationViewer({ configuration, furnitureType, projectId, isReadOnly, materials }: Props) {
  const schema = furnitureType.schema as Schema
  const dimSpecs = schema.dimensions ?? {}
  const panelTemplates: PanelTemplate[] = schema.panels ?? []

  // Support old applied_config format ({ width: 900, ... }) and new format
  // ({ dimensions: { width: 900 }, panels: [...], hardware_list: [] })
  const rawConfig = configuration.applied_config as Record<string, unknown>
  const isNewFormat = "dimensions" in rawConfig
  const savedDimensions: Record<string, number> = isNewFormat
    ? (rawConfig.dimensions as Record<string, number>)
    : (rawConfig as Record<string, number>)
  const savedPanels = isNewFormat && Array.isArray(rawConfig.panels)
    ? (rawConfig.panels as Array<{ material_id: string; thickness_mm: number }>)
    : []

  const [dimensions, setDimensions] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      Object.entries(dimSpecs).map(([k, s]) => [k, savedDimensions[k] ?? s.default])
    )
  )
  const [panelAssignments, setPanelAssignments] = useState<PanelAssignment[]>(() =>
    panelTemplates.map((_, i) => ({
      materialId: savedPanels[i]?.material_id ?? null,
      thickness_mm: savedPanels[i]?.thickness_mm ?? null,
    }))
  )
  const [inputErrors, setInputErrors] = useState<Record<string, string>>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isPlacingOrder, setIsPlacingOrder] = useState(false)
  const [orderError, setOrderError] = useState<string | null>(null)

  const hasDimChanges = Object.keys(dimSpecs).some(
    (key) => dimensions[key] !== savedDimensions[key]
  )
  const hasPanelChanges = panelTemplates.some((_, i) => {
    const cur = panelAssignments[i]
    const sav = savedPanels[i]
    return (
      cur?.materialId !== (sav?.material_id ?? null) ||
      cur?.thickness_mm !== (sav?.thickness_mm ?? null)
    )
  })
  const hasUnsavedChanges = hasDimChanges || hasPanelChanges
  const hasInputErrors = Object.keys(inputErrors).length > 0

  const allPanelsAssigned =
    panelTemplates.length === 0 ||
    panelTemplates.every(
      (_, i) => !!panelAssignments[i]?.materialId && !!panelAssignments[i]?.thickness_mm
    )

  function handleSliderChange(key: string, value: number) {
    setDimensions((prev) => ({ ...prev, [key]: value }))
    setInputErrors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  function handleInputChange(key: string, raw: string, spec: DimensionSpec) {
    if (raw.trim() === "") {
      setInputErrors((prev) => ({ ...prev, [key]: `Must be between ${spec.min} and ${spec.max} mm` }))
      return
    }
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
    setDimensions(
      Object.fromEntries(
        Object.entries(dimSpecs).map(([k, s]) => [k, savedDimensions[k] ?? s.default])
      )
    )
    setPanelAssignments(
      panelTemplates.map((_, i) => ({
        materialId: savedPanels[i]?.material_id ?? null,
        thickness_mm: savedPanels[i]?.thickness_mm ?? null,
      }))
    )
    setInputErrors({})
    setSaveError(null)
  }

  async function handleSave() {
    if (hasInputErrors) return
    setIsSaving(true)
    setSaveError(null)
    const appliedConfig: AppliedConfig = {
      dimensions,
      panels: panelTemplates.map((tpl, i) => {
        const a = panelAssignments[i]
        return {
          name: tpl.name,
          material_id: a?.materialId ?? "",
          thickness_mm: a?.thickness_mm ?? 0,
          width_mm: dimensions[tpl.width_key] ?? 0,
          height_mm: dimensions[tpl.height_key] ?? 0,
          quantity: tpl.quantity ?? 1,
          grain_direction: tpl.grain_direction ?? "none",
          edge_banding: {
            left:   tpl.edge_banding?.left   ?? false,
            right:  tpl.edge_banding?.right  ?? false,
            top:    tpl.edge_banding?.top    ?? false,
            bottom: tpl.edge_banding?.bottom ?? false,
          },
        }
      }),
      hardware_list: [],
    }
    const result = await updateConfigurationAction(configuration.id, projectId, appliedConfig)
    if (result?.error) {
      setSaveError(result.error)
      setIsSaving(false)
    }
    // On success, updateConfigurationAction calls redirect() — no further state update needed
  }

  async function handlePlaceOrder() {
    setIsPlacingOrder(true)
    setOrderError(null)
    const result = await createOrderAction(configuration.id, projectId)
    if (result?.error) {
      setOrderError(result.error)
      setIsPlacingOrder(false)
    }
    // On success, createOrderAction calls redirect() — no further state update needed
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

          {/* Materials section — shown when the furniture type schema defines panel templates */}
          {panelTemplates.length > 0 && (
            <>
              <hr className="border-slate-800" />
              <p className="text-xs uppercase tracking-widest text-slate-500">Materials</p>
              {panelTemplates.map((tpl, i) => {
                const widthMm = dimensions[tpl.width_key] ?? 0
                const heightMm = dimensions[tpl.height_key] ?? 0
                const assignment = panelAssignments[i]
                const selectedMaterial = materials.find((m) => m.id === assignment?.materialId)
                return (
                  <div key={tpl.name} className="mb-1">
                    <span className="block text-xs text-slate-400 mb-1">
                      {tpl.name}
                      {tpl.quantity && tpl.quantity > 1 ? ` ×${tpl.quantity}` : ""}{" "}
                      <span className="text-slate-600">{widthMm} × {heightMm} mm</span>
                    </span>
                    <select
                      value={assignment?.materialId ?? ""}
                      disabled={isReadOnly}
                      onChange={(e) => {
                        const matId = e.target.value || null
                        setPanelAssignments((prev) =>
                          prev.map((a, idx) =>
                            idx === i ? { ...a, materialId: matId, thickness_mm: null } : a
                          )
                        )
                      }}
                      className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-xs text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed mb-1"
                    >
                      <option value="">— select material —</option>
                      {materials.map((mat) => (
                        <option key={mat.id} value={mat.id}>
                          {mat.name} ({mat.sku})
                        </option>
                      ))}
                    </select>
                    {selectedMaterial && (
                      <select
                        value={assignment?.thickness_mm ?? ""}
                        disabled={isReadOnly}
                        onChange={(e) => {
                          const t = e.target.value ? Number(e.target.value) : null
                          setPanelAssignments((prev) =>
                            prev.map((a, idx) =>
                              idx === i ? { ...a, thickness_mm: t } : a
                            )
                          )
                        }}
                        className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-xs text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <option value="">— select thickness —</option>
                        {selectedMaterial.thickness_options.map((t) => (
                          <option key={t} value={t}>
                            {t} mm
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )
              })}
            </>
          )}

          <hr className="border-slate-800" />

          {isReadOnly && (
            <div className="bg-green-950 border border-green-900 rounded-md px-3 py-2 text-xs text-green-400">
              This configuration is <strong>{configuration.status}</strong> — dimensions are locked.
              Orbit and zoom are still available.
            </div>
          )}

          {!isReadOnly && hasUnsavedChanges && (
            <div className="bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-xs text-slate-400">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 mr-1.5 align-middle" />
              Unsaved changes
            </div>
          )}
          {!isReadOnly && hasUnsavedChanges && configuration.status === "confirmed" && (
            <div className="bg-blue-950 border border-blue-900 rounded-md px-3 py-2 text-xs text-blue-300">
              <strong>Editing confirmed config</strong> — saving resets status to draft.
              Re-confirm from the project page when ready.
            </div>
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

          {!isReadOnly && configuration.status === "confirmed" && !hasUnsavedChanges && allPanelsAssigned && (
            <>
              <hr className="border-slate-800" />
              {orderError && (
                <div className="bg-red-950 border border-red-900 rounded-md px-3 py-2 text-xs text-red-400">
                  {orderError}
                </div>
              )}
              <button
                onClick={handlePlaceOrder}
                disabled={isPlacingOrder}
                className="w-full py-2 rounded-md bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
              >
                {isPlacingOrder ? "Placing order…" : "Place Order"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
