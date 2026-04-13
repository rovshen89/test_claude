import { auth, signOut } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect("/login")

  async function signOutAction() {
    "use server"
    await signOut({ redirectTo: "/login" })
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <nav className="bg-slate-900 border-b border-slate-800 h-12 flex items-center justify-between px-6">
        <Link href="/dashboard" className="text-sm font-semibold text-slate-50">
          Configurator
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-xs text-slate-500">{session.user.email}</span>
          <form action={signOutAction}>
            <button type="submit" className="text-xs text-indigo-400 hover:text-indigo-300">
              Sign out
            </button>
          </form>
        </div>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  )
}
