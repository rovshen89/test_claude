import { auth } from "@/lib/auth"
import { getMaterial, ApiError, type Material } from "@/lib/api"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { MaterialDetailForm } from "./_components/MaterialDetailForm"

export default async function MaterialDetailPage({
  params,
}: {
  params: Promise<{ matId: string }>
}) {
  const { matId } = await params
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token
  const canManage = session.user.role === "admin" || session.user.role === "manufacturer"

  let material!: Material
  try {
    material = await getMaterial(token, matId)
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound()
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    throw e
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-4">
        <Link href="/materials" className="text-xs text-indigo-400 hover:text-indigo-300">
          ← Back to materials
        </Link>
      </div>
      <h1 className="text-lg font-semibold text-slate-50 mb-2">{material.name}</h1>
      <p className="text-xs text-slate-500 mb-6 font-mono">{material.id}</p>

      {canManage ? (
        <MaterialDetailForm material={material} />
      ) : (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 flex flex-col gap-3 text-sm">
          <div>
            <span className="block text-xs text-slate-400 mb-1">SKU</span>
            <p className="text-slate-100">{material.sku}</p>
          </div>
          <div>
            <span className="block text-xs text-slate-400 mb-1">Category</span>
            <p className="text-slate-100">{material.category}</p>
          </div>
          <div>
            <span className="block text-xs text-slate-400 mb-1">Thickness options (mm)</span>
            <p className="text-slate-100">{(material.thickness_options ?? []).join(", ")}</p>
          </div>
          <div>
            <span className="block text-xs text-slate-400 mb-1">Price per m²</span>
            <p className="text-slate-100">
              {material.price_per_m2 != null ? `$${Number(material.price_per_m2).toFixed(2)}` : "—"}
            </p>
          </div>
          <div>
            <span className="block text-xs text-slate-400 mb-1">Edgebanding price per mm</span>
            <p className="text-slate-100">
              {material.edgebanding_price_per_mm != null
                ? `$${Number(material.edgebanding_price_per_mm).toFixed(3)}`
                : "—"}
            </p>
          </div>
          <div>
            <span className="block text-xs text-slate-400 mb-1">Grain direction</span>
            <p className="text-slate-100">{material.grain_direction}</p>
          </div>
        </div>
      )}
    </div>
  )
}
