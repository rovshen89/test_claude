import { auth } from "@/lib/auth"
import { listMaterials } from "@/lib/api"
import { redirect } from "next/navigation"
import Link from "next/link"
import { DeleteButton } from "@/app/(app)/_components/DeleteButton"
import { deleteMaterialAction } from "@/app/actions/materials"

export default async function MaterialsPage() {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token

  const materials = await listMaterials(token)
  const canManage = session.user.role === "admin" || session.user.role === "manufacturer"

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-slate-50">Materials</h1>
        {canManage && (
          <Link
            href="/materials/new"
            className="px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-sm text-white font-medium transition-colors"
          >
            New Material
          </Link>
        )}
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <table className="w-full text-sm text-slate-400">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left py-3 px-4">Name</th>
              <th className="text-left py-3 px-4">SKU</th>
              <th className="text-left py-3 px-4">Category</th>
              <th className="text-right py-3 px-4">Thickness (mm)</th>
              <th className="text-right py-3 px-4">Price/m²</th>
              <th className="text-left py-3 px-4">Grain</th>
              <th className="text-center py-3 px-4">Textures</th>
              {canManage && <th className="py-3 px-4" />}
            </tr>
          </thead>
          <tbody>
            {materials.map((mat) => (
              <tr key={mat.id} className="border-b border-slate-800 last:border-0">
                <td className="py-3 px-4 text-slate-200">{mat.name}</td>
                <td className="py-3 px-4 font-mono text-xs">{mat.sku}</td>
                <td className="py-3 px-4">{mat.category}</td>
                <td className="py-3 px-4 text-right">{(mat.thickness_options ?? []).join(", ")}</td>
                <td className="py-3 px-4 text-right">{mat.price_per_m2 != null ? `$${mat.price_per_m2.toFixed(2)}` : "—"}</td>
                <td className="py-3 px-4">{mat.grain_direction}</td>
                <td className="py-3 px-4 text-center">{mat.s3_albedo ? "✓" : "—"}</td>
                {canManage && (
                  <td className="py-3 px-4 text-right">
                    <Link
                      href={`/materials/${mat.id}/edit`}
                      className="text-xs text-indigo-400 hover:text-indigo-300"
                    >
                      Edit
                    </Link>
                    <DeleteButton
                      action={() => deleteMaterialAction(mat.id)}
                      confirmMessage={`Delete "${mat.name}"? This cannot be undone.`}
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {materials.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-500">No materials found.</p>
        )}
      </div>
    </div>
  )
}
