import { auth } from "@/lib/auth"
import {
  getProjects,
  listAllConfigurations,
  ApiError,
  type Configuration,
  type Project,
} from "@/lib/api"
import { redirect } from "next/navigation"
import Link from "next/link"

export default async function ConfigurationsPage() {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token

  let configurations: Configuration[] = []
  let projects: Project[] = []
  try {
    configurations = await listAllConfigurations(token)
    projects = await getProjects(token)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    throw e
  }

  const projectMap: Record<string, string> = {}
  for (const project of projects) {
    projectMap[project.id] = project.name
  }

  return (
    <div className="max-w-5xl">
      <h1 className="text-lg font-semibold text-slate-50 mb-6">Configurations</h1>
      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <table className="w-full text-sm text-slate-400">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left py-3 px-4">Project</th>
              <th className="text-left py-3 px-4">Config ID</th>
              <th className="text-left py-3 px-4">Status</th>
              <th className="py-3 px-4" />
            </tr>
          </thead>
          <tbody>
            {configurations.map((cfg) => (
              <tr key={cfg.id} className="border-b border-slate-800 last:border-0">
                <td className="py-3 px-4">
                  <Link
                    href={`/projects/${cfg.project_id}`}
                    className="text-slate-200 hover:text-indigo-300"
                  >
                    {projectMap[cfg.project_id] ?? cfg.project_id}
                  </Link>
                </td>
                <td className="py-3 px-4 font-mono text-xs">{cfg.id.slice(0, 8)}</td>
                <td className="py-3 px-4">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      cfg.status === "confirmed"
                        ? "bg-green-950 text-green-400 border border-green-900"
                        : "bg-amber-950 text-amber-400 border border-amber-900"
                    }`}
                  >
                    {cfg.status}
                  </span>
                </td>
                <td className="py-3 px-4 text-right">
                  <Link
                    href={`/projects/${cfg.project_id}/configurations/${cfg.id}`}
                    className="text-xs text-indigo-400 hover:text-indigo-300"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {configurations.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-500">No configurations yet.</p>
        )}
      </div>
    </div>
  )
}
