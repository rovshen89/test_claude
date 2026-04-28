import { auth } from "@/lib/auth"
import { getFurnitureTypes } from "@/lib/api"
import { redirect } from "next/navigation"
import Link from "next/link"

export default async function FurnitureTypesPage() {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token

  const furnitureTypes = await getFurnitureTypes(token)
  const canManage = session.user.role === "admin" || session.user.role === "manufacturer"

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-slate-50">Furniture Types</h1>
        {canManage && (
          <Link
            href="/furniture-types/new"
            className="px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-sm text-white font-medium transition-colors"
          >
            New Furniture Type
          </Link>
        )}
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <table className="w-full text-sm text-slate-400">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left py-3 px-4">Category</th>
              <th className="text-left py-3 px-4">ID</th>
              <th className="text-left py-3 px-4">Tenant</th>
              <th className="text-left py-3 px-4">Schema keys</th>
              <th className="py-3 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {furnitureTypes.map((ft) => (
              <tr key={ft.id} className="border-b border-slate-800 last:border-0">
                <td className="py-3 px-4 text-slate-200">{ft.category}</td>
                <td className="py-3 px-4 font-mono text-xs">{ft.id}</td>
                <td className="py-3 px-4">{ft.tenant_id ?? "Global"}</td>
                <td className="py-3 px-4 text-xs">
                  {Object.keys(ft.schema).join(", ") || "—"}
                </td>
                <td className="py-3 px-4 text-right">
                  <Link
                    href={`/furniture-types/${ft.id}`}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                  >
                    View →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {furnitureTypes.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-500">No furniture types found.</p>
        )}
      </div>
    </div>
  )
}
