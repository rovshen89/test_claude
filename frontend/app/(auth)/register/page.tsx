import { signIn } from "@/lib/auth"
import { AuthError } from "next-auth"
import { redirect } from "next/navigation"
import Link from "next/link"

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  async function registerAction(formData: FormData) {
    "use server"
    const email = formData.get("email")
    const password = formData.get("password")
    if (typeof email !== "string" || typeof password !== "string") {
      redirect("/register?error=error")
    }

    const res = await fetch(`${process.env.BACKEND_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })

    if (!res.ok) {
      let code = "error"
      try {
        const body = (await res.json()) as { detail?: string }
        if (body.detail?.toLowerCase().includes("already")) code = "taken"
      } catch {
        // non-JSON error body — use generic code
      }
      redirect(`/register?error=${code}`)
    }

    // Auto-login after successful registration
    try {
      await signIn("credentials", { email, password, redirectTo: "/dashboard" })
    } catch (e) {
      if (e instanceof AuthError) redirect("/login?error=1")
      throw e
    }
  }

  const errorMessage =
    error === "taken"
      ? "That email is already registered."
      : error
      ? "Something went wrong. Please try again."
      : null

  return (
    <div className="w-full max-w-sm">
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-8">
        <h1 className="text-xl font-semibold text-slate-50 mb-1">Create account</h1>
        <p className="text-sm text-slate-500 mb-6">Furniture configurator platform</p>
        {errorMessage && (
          <p className="text-sm text-red-400 mb-4">{errorMessage}</p>
        )}
        <form action={registerAction} className="space-y-4">
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
              Password{" "}
              <span className="text-slate-600">(8+ characters)</span>
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-md py-2 text-sm font-medium transition-colors"
          >
            Create account
          </button>
        </form>
        <p className="text-center text-xs text-slate-500 mt-5">
          Already registered?{" "}
          <Link href="/login" className="text-indigo-400 hover:text-indigo-300">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
