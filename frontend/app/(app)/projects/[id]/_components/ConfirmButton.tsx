"use client"

import { useState } from "react"
import { confirmConfigurationAction } from "@/app/actions/configurations"

export function ConfirmButton({
  configId,
  projectId,
}: {
  configId: string
  projectId: string
}) {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleClick() {
    setState("loading")
    setErrorMsg(null)
    const result = await confirmConfigurationAction(configId, projectId)
    if (result?.error) {
      setState("error")
      setErrorMsg(result.error === "already_confirmed" ? "Already confirmed" : "Failed to confirm")
    } else {
      setState("idle")
      // revalidatePath in the Server Action causes the parent Server Component to re-render
    }
  }

  return (
    <div className="flex items-center gap-2">
      {state === "error" && (
        <span className="text-xs text-red-400">{errorMsg}</span>
      )}
      <button
        onClick={handleClick}
        disabled={state === "loading"}
        className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {state === "loading" ? "Confirming…" : "Confirm"}
      </button>
    </div>
  )
}
