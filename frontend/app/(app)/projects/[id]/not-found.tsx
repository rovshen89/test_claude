import Link from "next/link"

export default function ProjectNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
      <p className="text-slate-400 text-sm">Project not found.</p>
      <Link href="/dashboard" className="text-indigo-400 hover:text-indigo-300 text-sm">
        ← Back to projects
      </Link>
    </div>
  )
}
