import { auth } from "@/lib/auth"
import { getProjects, ApiError } from "@/lib/api"
import { redirect } from "next/navigation"
import Link from "next/link"

export default async function ProjectsPage() {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")

  let projects
  try {
    projects = await getProjects(session.user.access_token)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    throw e
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-lg font-semibold text-slate-50">Projects</h1>
        <Link
          href="/projects/new"
          className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-md px-4 py-2 text-sm font-medium transition-colors"
        >
          + New Project
        </Link>
      </div>
      {projects.length === 0 ? (
        <p className="text-slate-500 text-sm">
          No projects yet.{" "}
          <Link href="/projects/new" className="text-indigo-400 hover:text-indigo-300">
            Create your first one.
          </Link>
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="bg-slate-800 border border-slate-700 rounded-lg p-4 hover:border-slate-600 transition-colors"
            >
              <p className="text-sm font-medium text-slate-100">{project.name}</p>
              <p className="text-xs text-slate-500 mt-1">
                Created {new Date(project.created_at).toLocaleDateString("en-US")}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
