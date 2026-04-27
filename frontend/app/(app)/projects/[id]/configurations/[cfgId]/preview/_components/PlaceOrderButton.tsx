"use client"

import { useState } from "react"
import { createOrderAction } from "@/app/actions/orders"

export function PlaceOrderButton({
  configId,
  projectId,
}: {
  configId: string
  projectId: string
}) {
  const [isPlacing, setIsPlacing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setIsPlacing(true)
    setError(null)
    const result = await createOrderAction(configId, projectId)
    if (result?.error) {
      setError(result.error)
      setIsPlacing(false)
    }
    // On success: createOrderAction redirects to the order detail page
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <div className="bg-red-950 border border-red-900 rounded-md px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}
      <button
        onClick={handleClick}
        disabled={isPlacing}
        className="px-4 py-2 rounded-md bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm text-white font-medium transition-colors"
      >
        {isPlacing ? "Placing order…" : "Place Order"}
      </button>
    </div>
  )
}
