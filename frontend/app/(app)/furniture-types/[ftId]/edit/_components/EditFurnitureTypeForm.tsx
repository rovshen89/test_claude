"use client"

import { useState } from "react"
import { updateFurnitureTypeAction } from "@/app/actions/furniture-types"

export function EditFurnitureTypeForm({
  ftId,
  currentCategory,
  currentSchema,
}: {
  ftId: string
  currentCategory: string
  currentSchema: Record<string, unknown>
}) {
  const [category, setCategory] = useState(currentCategory)
  const [schemaText, setSchemaText] = useState(JSON.stringify(currentSchema, null, 2))
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(schemaText)
    } catch (err) {
      setError(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`)
      return
    }

    setIsSubmitting(true)
    const result = await updateFurnitureTypeAction(ftId, { category, schema: parsed })
    if (result?.error) {
      setError(result.error)
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <div className="bg-red-950 border border-red-900 rounded-md px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}
      <div>
        <label htmlFor="category" className="block mb-1 text-xs font-medium text-slate-400">
          Category
        </label>
        <input
          id="category"
          required
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
        />
      </div>
      <div>
        <label htmlFor="schema" className="block mb-1 text-xs font-medium text-slate-400">
          Schema (JSON)
        </label>
        <textarea
          id="schema"
          required
          rows={18}
          value={schemaText}
          onChange={(e) => setSchemaText(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 font-mono outline-none focus:border-indigo-500 resize-y"
        />
      </div>
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-fit px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm text-white font-medium transition-colors"
      >
        {isSubmitting ? "Saving…" : "Save"}
      </button>
    </form>
  )
}
