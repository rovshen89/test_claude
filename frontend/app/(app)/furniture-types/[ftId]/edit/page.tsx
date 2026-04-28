import { auth } from "@/lib/auth"
import { getFurnitureType, ApiError, type FurnitureType } from "@/lib/api"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { EditFurnitureTypeForm } from "./_components/EditFurnitureTypeForm"

export default async function FurnitureTypeEditPage({
  params,
}: {
  params: Promise<{ ftId: string }>
}) {
  const { ftId } = await params
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token

  const canManage = session.user.role === "admin" || session.user.role === "manufacturer"
  if (!canManage) redirect(`/furniture-types/${ftId}`)

  let ft!: FurnitureType
  try {
    ft = await getFurnitureType(token, ftId)
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound()
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    throw e
  }

  return (
    <div className="max-w-lg">
      <div className="mb-2">
        <Link href={`/furniture-types/${ftId}`} className="text-xs text-indigo-400 hover:text-indigo-300">
          ← Back to furniture type
        </Link>
      </div>
      <h1 className="text-lg font-semibold text-slate-50 mb-6">Edit Furniture Type</h1>
      <EditFurnitureTypeForm
        ftId={ftId}
        currentCategory={ft.category}
        currentSchema={ft.schema}
      />
    </div>
  )
}
