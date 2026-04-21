"use client"

import { useState } from "react"
import { dispatchOrderAction } from "@/app/actions/orders"

type Props = {
  orderId: string
  projectId: string
  initialCrmRef: string | null
  initialLastDispatch: { dispatched_at: string; http_status: number } | null
}

export function DispatchButton({
  orderId,
  projectId,
  initialCrmRef,
  initialLastDispatch,
}: Props) {
  const [isDispatching, setIsDispatching] = useState(false)
  const [result, setResult] = useState<{ http_status: number; crm_ref: string | null } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleDispatch() {
    if (isDispatching) return
    setIsDispatching(true)
    setError(null)
    setResult(null)
    const res = await dispatchOrderAction(orderId, projectId)
    if (res.error) {
      setError(res.error)
    } else if (res.result) {
      setResult(res.result)
    } else {
      setError("Dispatch failed — no response from server")
    }
    setIsDispatching(false)
  }

  const crmRef = result?.crm_ref ?? initialCrmRef

  return (
    <div className="flex flex-col gap-3">
      {initialLastDispatch && !result && (
        <p className="text-xs text-slate-500">
          Last dispatched:{" "}
          {new Date(initialLastDispatch.dispatched_at).toLocaleString()} —{" "}
          <span
            className={
              initialLastDispatch.http_status < 300 ? "text-green-400" : "text-amber-400"
            }
          >
            HTTP {initialLastDispatch.http_status}
          </span>
        </p>
      )}

      {result && (
        <div
          className={`rounded-md px-3 py-2 text-xs ${
            result.http_status < 300
              ? "bg-green-950 border border-green-900 text-green-400"
              : "bg-amber-950 border border-amber-900 text-amber-400"
          }`}
        >
          {result.http_status < 300
            ? `CRM accepted (${result.http_status})`
            : `CRM returned ${result.http_status}`}
          {result.crm_ref && (
            <span className="ml-2 font-mono">{result.crm_ref}</span>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-950 border border-red-900 rounded-md px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {crmRef && !result && (
        <p className="text-xs text-slate-500">
          CRM ref: <span className="font-mono text-slate-400">{crmRef}</span>
        </p>
      )}

      <button
        onClick={handleDispatch}
        disabled={isDispatching}
        className="w-fit px-4 py-2 rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm text-slate-200 font-medium transition-colors"
      >
        {isDispatching ? "Dispatching…" : "Dispatch to CRM"}
      </button>
    </div>
  )
}
