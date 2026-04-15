import { auth } from "@/lib/auth"
import { createProject, ApiError } from "@/lib/api"
import { redirect } from "next/navigation"
import Link from "next/link"

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")

  async function createAction(formData: FormData) {
    "use server"
    const raw = formData.get("name")
    if (typeof raw !== "string" || raw.trim() === "") {
      redirect("/projects/new?error=name")
    }
    const name = raw.trim()
    const session = await auth()
    if (!session?.user?.access_token) redirect("/login")
    try {
      const project = await createProject(session.user.access_token, name)
      redirect(`/projects/${project.id}`)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) redirect("/login")
      throw e
    }
  }

  return (
    <div className="max-w-md">
      <div className="mb-4">
        <Link href="/dashboard" className="text-xs text-indigo-400 hover:text-indigo-300">
          ← Projects
        </Link>
      </div>
      <h1 className="text-lg font-semibold text-slate-50 mb-6">New Project</h1>
      {error && (
        <p className="text-sm text-red-400 mb-4">Project name is required.</p>
      )}
      <form action={createAction} className="space-y-4">
        <div>
          <label className="block text-xs text-slate-400 mb-1.5" htmlFor="name">
            Project name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            autoFocus
            className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder="Kitchen Remodel"
          />
        </div>
        <div className="flex gap-3">
          <button
            type="submit"
            className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-md px-4 py-2 text-sm font-medium transition-colors"
          >
            Create project
          </button>
          <Link
            href="/dashboard"
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md px-4 py-2 text-sm font-medium transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
