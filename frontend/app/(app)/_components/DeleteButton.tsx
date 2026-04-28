"use client"

import { useState } from "react"

export function DeleteButton({
  action,
  label = "Delete",
  confirmMessage = "Are you sure? This cannot be undone.",
}: {
  action: () => Promise<{ error?: string } | undefined>
  label?: string
  confirmMessage?: string
}) {
  const [error, setError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  async function handleClick() {
    if (!window.confirm(confirmMessage)) return
    setIsDeleting(true)
    setError(null)
    const result = await action()
    if (result?.error) {
      setError(result.error)
      setIsDeleting(false)
    }
    // On success: action redirects
  }

  return (
    <div>
      {error && <p className="text-xs text-red-400 mb-1">{error}</p>}
      <button
        onClick={handleClick}
        disabled={isDeleting}
        className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isDeleting ? "Deleting…" : label}
      </button>
    </div>
  )
}
