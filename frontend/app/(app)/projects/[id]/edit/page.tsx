import { auth } from "@/lib/auth"
import { getProject, ApiError, type Project } from "@/lib/api"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { EditProjectForm } from "./_components/EditProjectForm"

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token

  let project!: Project
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
          ← Back to project
        </Link>
      </div>
      <h1 className="text-lg font-semibold text-slate-50 mb-6">Rename Project</h1>
      <EditProjectForm projectId={id} currentName={project.name} />
    </div>
  )
}
