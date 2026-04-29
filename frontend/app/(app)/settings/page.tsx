import { auth } from "@/lib/auth"
import { getTenant, ApiError, type TenantSettings } from "@/lib/api"
import { redirect } from "next/navigation"
import { TenantSettingsForm } from "./_components/TenantSettingsForm"

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token

  let tenant: TenantSettings | null = null
  try {
    tenant = await getTenant(token)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    // 404 = no tenant (admin without tenant) — render informational message below
    if (!(e instanceof ApiError && e.status === 404)) throw e
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-lg font-semibold text-slate-50 mb-6">Settings</h1>
      {tenant ? (
        <TenantSettingsForm tenant={tenant} />
      ) : (
        <p className="text-sm text-slate-500">
          No tenant is associated with your account. Settings are configured per tenant.
        </p>
      )}
    </div>
  )
}
