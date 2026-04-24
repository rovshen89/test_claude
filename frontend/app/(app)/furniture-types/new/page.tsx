import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { NewFurnitureTypeForm } from "./_components/NewFurnitureTypeForm"

export default async function NewFurnitureTypePage() {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const canManage = session.user.role === "admin" || session.user.role === "manufacturer"
  if (!canManage) redirect("/furniture-types")

  return (
    <div className="max-w-2xl">
      <div className="mb-4">
        <Link href="/furniture-types" className="text-xs text-indigo-400 hover:text-indigo-300">
          ← Back to furniture types
        </Link>
      </div>
      <h1 className="text-lg font-semibold text-slate-50 mb-6">New Furniture Type</h1>
      <NewFurnitureTypeForm />
    </div>
  )
}
