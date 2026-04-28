import { auth } from "@/lib/auth"
import { getFurnitureType, ApiError, type FurnitureType } from "@/lib/api"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"

export default async function FurnitureTypeDetailPage({
  params,
}: {
  params: Promise<{ ftId: string }>
}) {
  const { ftId } = await params
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token

  let ft!: FurnitureType
  try {
    ft = await getFurnitureType(token, ftId)
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound()
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    throw e
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-2">
        <Link href="/furniture-types" className="text-xs text-indigo-400 hover:text-indigo-300">
          ← Furniture Types
        </Link>
      </div>
      <h1 className="text-lg font-semibold text-slate-50 mb-6">{ft.category}</h1>

      <section className="bg-slate-800 border border-slate-700 rounded-lg p-4 mb-4">
        <dl className="space-y-2 text-xs">
          <div className="flex gap-4">
            <dt className="text-slate-500 w-16 shrink-0">ID</dt>
            <dd className="font-mono text-slate-300">{ft.id}</dd>
          </div>
          <div className="flex gap-4">
            <dt className="text-slate-500 w-16 shrink-0">Tenant</dt>
            <dd className="text-slate-300">{ft.tenant_id ?? "Global"}</dd>
          </div>
        </dl>
      </section>

      <section className="bg-slate-800 border border-slate-700 rounded-lg p-4">
        <h2 className="text-xs font-medium text-slate-400 mb-3">Schema</h2>
        <pre className="bg-slate-900 border border-slate-700 rounded-md p-4 text-xs text-slate-300 font-mono overflow-auto">
          {JSON.stringify(ft.schema, null, 2)}
        </pre>
      </section>
    </div>
  )
}
