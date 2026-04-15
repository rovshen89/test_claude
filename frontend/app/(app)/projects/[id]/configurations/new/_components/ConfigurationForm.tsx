"use client"

import { useState } from "react"
import Link from "next/link"
import { createConfigurationAction } from "@/app/actions/configurations"
import type { FurnitureType } from "@/lib/api"

type DimensionSpec = { min: number; max: number; step: number; default: number }
type FurnitureSchema = { dimensions?: Record<string, DimensionSpec> }

function getDimensions(schema: Record<string, unknown>): Record<string, DimensionSpec> {
  const s = schema as FurnitureSchema
  return s.dimensions ?? {}
}

function defaultDimensions(schema: Record<string, unknown>): Record<string, number> {
  const dims = getDimensions(schema)
  return Object.fromEntries(Object.entries(dims).map(([k, v]) => [k, v.default]))
}

export function ConfigurationForm({
  furnitureTypes,
  projectId,
}: {
  furnitureTypes: FurnitureType[]
  projectId: string
}) {
  const [selectedTypeId, setSelectedTypeId] = useState(furnitureTypes[0]?.id ?? "")
  // Non-null assertion: parent page guarantees furnitureTypes is non-empty before rendering this component
  const selectedType = (furnitureTypes.find((ft) => ft.id === selectedTypeId) ?? furnitureTypes[0])!
  const [dimensions, setDimensions] = useState<Record<string, number>>(
    () => defaultDimensions(selectedType.schema)
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function handleTypeSelect(id: string) {
    const ft = furnitureTypes.find((f) => f.id === id)
    if (!ft) return
    setSelectedTypeId(id)
    setDimensions(defaultDimensions(ft.schema))
    setErrors({})
    setSubmitError(null)
  }

  function handleDimensionChange(key: string, value: string) {
    setDimensions((prev) => ({ ...prev, [key]: Number(value) }))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  function validate(): boolean {
    const dims = getDimensions(selectedType.schema)
    const newErrors: Record<string, string> = {}
    for (const [key, spec] of Object.entries(dims)) {
      const val = dimensions[key] ?? spec.default
      if (val < spec.min || val > spec.max) {
        newErrors[key] = `Must be between ${spec.min} and ${spec.max} mm (step ${spec.step})`
      }
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    setSubmitError(null)
    const result = await createConfigurationAction(projectId, selectedTypeId, dimensions)
    if (result?.error) {
      setSubmitError(result.error)
      setSubmitting(false)
    }
    // On success, createConfigurationAction calls redirect() which navigates the browser
    // away from this page — no further state update needed
  }

  const dims = getDimensions(selectedType.schema)

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Furniture type selector */}
      <div>
        <p className="text-xs text-slate-400 uppercase tracking-wide mb-3">Furniture Type</p>
        <div className="flex flex-wrap gap-2">
          {furnitureTypes.map((ft) => (
            <button
              key={ft.id}
              type="button"
              onClick={() => handleTypeSelect(ft.id)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                ft.id === selectedTypeId
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-800 border border-slate-700 text-slate-400 hover:border-slate-600"
              }`}
            >
              {ft.category}
            </button>
          ))}
        </div>
      </div>

      {/* Dimension inputs — only shown when the selected type has dimensions */}
      {Object.keys(dims).length > 0 && (
        <>
          <div className="border-t border-slate-800" />
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-3">Dimensions</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(dims).map(([key, spec]) => (
                <div key={key}>
                  <label
                    htmlFor={`dim-${key}`}
                    className="block text-xs text-slate-400 mb-1.5 capitalize"
                  >
                    {key} (mm)
                  </label>
                  <input
                    id={`dim-${key}`}
                    type="number"
                    min={spec.min}
                    max={spec.max}
                    step={spec.step}
                    value={dimensions[key] ?? spec.default}
                    onChange={(e) => handleDimensionChange(key, e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <p className="text-xs text-slate-600 mt-1">
                    {spec.min} – {spec.max}, step {spec.step}
                  </p>
                  {errors[key] && (
                    <p className="text-xs text-red-400 mt-1">{errors[key]}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Submit error banner */}
      {submitError && (
        <div className="bg-red-950 border border-red-900 rounded-md px-4 py-3 text-sm text-red-400">
          {submitError}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md px-4 py-2 text-sm font-medium transition-colors"
        >
          {submitting ? "Saving…" : "Save as draft"}
        </button>
        <Link
          href={`/projects/${projectId}`}
          className="bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md px-4 py-2 text-sm font-medium transition-colors"
        >
          Cancel
        </Link>
      </div>
    </form>
  )
}
