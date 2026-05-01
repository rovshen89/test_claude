import Link from "next/link"

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4">
      <p className="text-slate-400 text-sm">Page not found.</p>
      <Link href="/projects" className="text-indigo-400 hover:text-indigo-300 text-sm">
        ← Projects
      </Link>
    </div>
  )
}
