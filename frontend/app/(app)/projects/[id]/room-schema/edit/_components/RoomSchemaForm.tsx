"use client"

import { useState } from "react"
import { updateRoomSchemaAction } from "@/app/actions/projects"

export function RoomSchemaForm({
  projectId,
  currentSchema,
}: {
  projectId: string
  currentSchema: Record<string, unknown> | null
}) {
  const [schemaText, setSchemaText] = useState(
    currentSchema !== null ? JSON.stringify(currentSchema, null, 2) : ""
  )
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
    const result = await updateRoomSchemaAction(projectId, parsed)
    if (result?.error) {
      setError(result.error)
      setIsSubmitting(false)
    }
    // On success: server action redirects to /projects/${projectId}
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <div className="bg-red-950 border border-red-900 rounded-md px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}
      <div>
        <label htmlFor="schema" className="block mb-1 text-xs font-medium text-slate-400">
          Room Schema (JSON)
        </label>
        <textarea
          id="schema"
          required
          rows={12}
          value={schemaText}
          onChange={(e) => setSchemaText(e.target.value)}
          placeholder={'{\n  "width": 3000,\n  "height": 2400,\n  "depth": 4000\n}'}
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
