import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"

if (!process.env.BACKEND_URL) {
  throw new Error("BACKEND_URL environment variable is not set")
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        try {
          const res = await fetch(`${process.env.BACKEND_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          })
          if (!res.ok) return null
          const data = (await res.json()) as { access_token: string }
          return {
            id: credentials.email as string,
            email: credentials.email as string,
            access_token: data.access_token,
          }
        } catch {
          return null
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.access_token) {
        token.access_token = user.access_token
        const parts = user.access_token.split(".")
        if (parts.length === 3) {
          try {
            const payload = JSON.parse(Buffer.from(parts[1], "base64").toString()) as Record<string, unknown>
            token.role = typeof payload.role === "string" ? payload.role : ""
          } catch {
            token.role = ""
          }
        } else {
          token.role = ""
        }
      }
      return token
    },
    async session({ session, token }) {
      session.user = {
        ...session.user,
        access_token: token.access_token ?? "",
        role: token.role ?? "",
      }
      return session
    },
  },
  pages: { signIn: "/login" },
})
