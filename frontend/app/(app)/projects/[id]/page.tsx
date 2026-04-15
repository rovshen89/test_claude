import { auth } from "@/lib/auth"
import { getProject, listConfigurations, getFurnitureType, ApiError, type Project, type Configuration } from "@/lib/api"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"

function statusColors(status: string): string {
  switch (status) {
    case "draft":
      return "bg-cyan-950 text-cyan-300"
    case "confirmed":
      return "bg-blue-950 text-blue-300"
    case "in_production":
      return "bg-amber-950 text-amber-300"
    case "completed":
      return "bg-green-950 text-green-400"
    default:
      return "bg-slate-800 text-slate-400"
  }
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token

  // Definite-assignment assertions (`!`) tell TypeScript the try block always assigns
  // these or throws (via notFound() / re-throw), so they're safe to use below.
  let project!: Project
  let configs!: Configuration[]
  try {
    ;[project, configs] = await Promise.all([
      getProject(token, id),
      listConfigurations(token, id),
    ])
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound()
    throw e
  }

  // Fetch furniture type names for all unique IDs in parallel
  const uniqueFtIds = [...new Set(configs.map((c) => c.furniture_type_id))]
  const ftList = await Promise.all(uniqueFtIds.map((ftId) => getFurnitureType(token, ftId)))
  const ftMap = Object.fromEntries(ftList.map((ft) => [ft.id, ft.category]))

  return (
    <div>
      <div className="mb-2">
        <Link href="/dashboard" className="text-xs text-indigo-400 hover:text-indigo-300">
          ← Projects
        </Link>
      </div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-lg font-semibold text-slate-50">{project.name}</h1>
        <button
          disabled
          title="Configuration builder coming in Sub-plan 2"
          className="border border-slate-700 text-slate-600 rounded-md px-4 py-2 text-sm font-medium cursor-not-allowed"
        >
          + New Configuration
        </button>
      </div>
      {configs.length === 0 ? (
        <p className="text-slate-500 text-sm">No configurations yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {configs.map((cfg) => (
            <div
              key={cfg.id}
              className="bg-slate-800 border border-slate-700 rounded-lg p-4"
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-slate-100">
                    {ftMap[cfg.furniture_type_id] ?? "Unknown type"}
                  </p>
                  <p className="text-xs text-slate-500 mt-1 font-mono">
                    {cfg.id.slice(0, 8)}…
                  </p>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${statusColors(cfg.status)}`}
                >
                  {cfg.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
