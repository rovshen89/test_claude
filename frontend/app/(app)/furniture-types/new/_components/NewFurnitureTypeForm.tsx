"use client"

import { useState } from "react"
import { createFurnitureTypeAction } from "@/app/actions/furniture-types"

const SCHEMA_PLACEHOLDER = `{
  "dimensions": {
    "width": { "min": 300, "max": 1200, "step": 10, "default": 600 },
    "height": { "min": 600, "max": 2400, "step": 10, "default": 1800 }
  },
  "panels": [
    {
      "name": "Top Panel",
      "width_key": "width",
      "height_key": "depth",
      "quantity": 1,
      "grain_direction": "horizontal",
      "edge_banding": { "left": true, "right": true, "top": false, "bottom": false }
    }
  ]
}`

export function NewFurnitureTypeForm() {
  const [category, setCategory] = useState("")
  const [schemaText, setSchemaText] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    let parsedSchema: Record<string, unknown>
    try {
      parsedSchema = JSON.parse(schemaText) as Record<string, unknown>
    } catch (parseErr) {
      setError(`Invalid JSON: ${(parseErr as Error).message}`)
      setIsSubmitting(false)
      return
    }

    const result = await createFurnitureTypeAction({ category, schema: parsedSchema })

    if (result?.error) {
      setError(result.error)
      setIsSubmitting(false)
    }
    // On success: createFurnitureTypeAction redirects to /furniture-types
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <div className="bg-red-950 border border-red-900 rounded-md px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="category" className="block text-xs text-slate-400 mb-1">
          Category
        </label>
        <input
          id="category"
          required
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="e.g. wardrobe, bookshelf, desk"
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
        />
      </div>

      <div>
        <label htmlFor="schema" className="block text-xs text-slate-400 mb-1">
          Schema (JSON)
        </label>
        <textarea
          id="schema"
          required
          rows={18}
          value={schemaText}
          onChange={(e) => setSchemaText(e.target.value)}
          placeholder={SCHEMA_PLACEHOLDER}
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-xs text-slate-100 font-mono outline-none focus:border-indigo-500 resize-y"
        />
        <p className="mt-1 text-xs text-slate-600">
          Must be valid JSON. Top-level keys: <code className="text-slate-500">dimensions</code> and/or <code className="text-slate-500">panels</code>.
        </p>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-fit px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm text-white font-medium transition-colors"
      >
        {isSubmitting ? "Creating…" : "Create Furniture Type"}
      </button>
    </form>
  )
}
