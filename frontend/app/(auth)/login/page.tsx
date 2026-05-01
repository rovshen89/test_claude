import { signIn } from "@/lib/auth"
import { AuthError } from "next-auth"
import { redirect } from "next/navigation"
import Link from "next/link"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  async function loginAction(formData: FormData) {
    "use server"
    const email = formData.get("email")
    const password = formData.get("password")
    if (typeof email !== "string" || typeof password !== "string") {
      redirect("/login?error=1")
    }
    try {
      await signIn("credentials", { email, password, redirectTo: "/projects" })
    } catch (e) {
      if (e instanceof AuthError) redirect("/login?error=1")
      throw e
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-8">
        <h1 className="text-xl font-semibold text-slate-50 mb-1">Sign in</h1>
        <p className="text-sm text-slate-500 mb-6">Furniture configurator platform</p>
        {error && (
          <p className="text-sm text-red-400 mb-4">Invalid email or password.</p>
        )}
        <form action={loginAction} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="you@company.com"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1.5" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-md py-2 text-sm font-medium transition-colors"
          >
            Sign in
          </button>
        </form>
        <p className="text-center text-xs text-slate-500 mt-5">
          No account?{" "}
          <Link href="/register" className="text-indigo-400 hover:text-indigo-300">
            Register
          </Link>
        </p>
      </div>
    </div>
  )
}
