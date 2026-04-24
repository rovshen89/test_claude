import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { NewMaterialForm } from "./_components/NewMaterialForm"

export default async function NewMaterialPage() {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const canManage = session.user.role === "admin" || session.user.role === "manufacturer"
  if (!canManage) redirect("/materials")

  return (
    <div className="max-w-2xl">
      <div className="mb-4">
        <Link href="/materials" className="text-xs text-indigo-400 hover:text-indigo-300">
          ← Back to materials
        </Link>
      </div>
      <h1 className="text-lg font-semibold text-slate-50 mb-6">New Material</h1>
      <NewMaterialForm />
    </div>
  )
}
