"use client"

import Link from "next/link"

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4">
      <p className="text-slate-400 text-sm">Something went wrong.</p>
      <div className="flex gap-4">
        <button
          onClick={reset}
          className="text-indigo-400 hover:text-indigo-300 text-sm"
        >
          Try again
        </button>
        <Link href="/projects" className="text-slate-500 hover:text-slate-400 text-sm">
          Go home
        </Link>
      </div>
    </div>
  )
}
