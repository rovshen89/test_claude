import { auth } from "@/lib/auth"
import { getMaterial, ApiError } from "@/lib/api"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { EditMaterialForm } from "./_components/EditMaterialForm"

export default async function EditMaterialPage({
  params,
}: {
  params: Promise<{ matId: string }>
}) {
  const { matId } = await params
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const canManage = session.user.role === "admin" || session.user.role === "manufacturer"
  if (!canManage) redirect("/materials")

  let material
  try {
    material = await getMaterial(session.user.access_token, matId)
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
      <h1 className="text-lg font-semibold text-slate-50 mb-2">Edit Material</h1>
      <p className="text-xs text-slate-500 mb-6 font-mono">{material.id}</p>
      <EditMaterialForm material={material} />
    </div>
  )
}
