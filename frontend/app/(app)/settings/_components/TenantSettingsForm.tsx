"use client"

import { useState } from "react"
import { updateTenantAction } from "@/app/actions/tenant"
import type { TenantSettings } from "@/lib/api"

export function TenantSettingsForm({ tenant }: { tenant: TenantSettings }) {
  const [name, setName] = useState(tenant.name)
  const [marginPct, setMarginPct] = useState(String(tenant.margin_pct))
  const [webhookUrl, setWebhookUrl] = useState(tenant.webhook_url ?? "")
  const [crmConfigText, setCrmConfigText] = useState(
    tenant.crm_config ? JSON.stringify(tenant.crm_config, null, 2) : ""
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)

    let crm_config: Record<string, unknown> | null = null
    if (crmConfigText.trim()) {
      try {
        crm_config = JSON.parse(crmConfigText)
      } catch (err) {
        setError(`Invalid CRM Config JSON: ${err instanceof Error ? err.message : String(err)}`)
        return
      }
    }

    setIsSubmitting(true)
    const result = await updateTenantAction({
      name,
      margin_pct: parseFloat(marginPct) || 0,
      webhook_url: webhookUrl.trim() || null,
      crm_config,
    })
    setIsSubmitting(false)
    if (result.error) {
      setError(result.error)
    } else {
      setSaved(true)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-lg">
      {error && (
        <div className="bg-red-950 border border-red-900 rounded-md px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}
      {saved && (
        <div className="bg-green-950 border border-green-900 rounded-md px-3 py-2 text-xs text-green-400">
          Settings saved.
        </div>
      )}
      <div>
        <label htmlFor="name" className="block mb-1 text-xs font-medium text-slate-400">
          Tenant Name
        </label>
        <input
          id="name"
          required
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
        />
      </div>
      <div>
        <label htmlFor="margin_pct" className="block mb-1 text-xs font-medium text-slate-400">
          Margin %
        </label>
        <input
          id="margin_pct"
          type="number"
          min="0"
          max="100"
          step="0.01"
          value={marginPct}
          onChange={(e) => setMarginPct(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
        />
      </div>
      <div>
        <label htmlFor="webhook_url" className="block mb-1 text-xs font-medium text-slate-400">
          Webhook URL
        </label>
        <input
          id="webhook_url"
          type="text"
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          placeholder="https://your-crm.example.com/webhook"
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
        />
      </div>
      <div>
        <label htmlFor="crm_config" className="block mb-1 text-xs font-medium text-slate-400">
          CRM Config (JSON, optional)
        </label>
        <textarea
          id="crm_config"
          rows={6}
          value={crmConfigText}
          onChange={(e) => setCrmConfigText(e.target.value)}
          placeholder='{"headers": {"X-Api-Key": "..."}}'
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 font-mono outline-none focus:border-indigo-500 resize-y"
        />
      </div>
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-fit px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm text-white font-medium transition-colors"
      >
        {isSubmitting ? "Saving…" : "Save Settings"}
      </button>
    </form>
  )
}
