import { auth } from "@/lib/auth"
import { getProject, ApiError } from "@/lib/api"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { RoomSchemaForm } from "./_components/RoomSchemaForm"

export default async function RoomSchemaEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token

  let project
  try {
    project = await getProject(token, id)
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound()
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    throw e
  }

  return (
    <div className="max-w-lg">
      <div className="mb-2">
        <Link href={`/projects/${id}`} className="text-xs text-indigo-400 hover:text-indigo-300">
          ← Project
        </Link>
      </div>
      <h1 className="text-lg font-semibold text-slate-50 mb-6">Edit Room Schema</h1>
      <RoomSchemaForm projectId={id} currentSchema={project.room_schema} />
    </div>
  )
}
