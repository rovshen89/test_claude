import { auth } from "@/lib/auth"
import { getProject, getFurnitureTypes, ApiError, type FurnitureType } from "@/lib/api"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ConfigurationForm } from "./_components/ConfigurationForm"

export default async function NewConfigurationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token

  let furnitureTypes: FurnitureType[] = []
  try {
    const results = await Promise.all([
      getProject(token, id),       // validates project exists + ownership → 404 if not found
      getFurnitureTypes(token),
    ])
    furnitureTypes = results[1]
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound()
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    throw e
  }

  return (
    <div className="max-w-xl">
      <div className="mb-4">
        <Link href={`/projects/${id}`} className="text-xs text-indigo-400 hover:text-indigo-300">
          ← Back to project
        </Link>
      </div>
      <h1 className="text-lg font-semibold text-slate-50 mb-6">New Configuration</h1>
      {furnitureTypes.length === 0 ? (
        <p className="text-slate-500 text-sm">No furniture types available.</p>
      ) : (
        <ConfigurationForm furnitureTypes={furnitureTypes} projectId={id} />
      )}
    </div>
  )
}
