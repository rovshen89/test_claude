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
      if (user) token.access_token = (user as { access_token: string }).access_token
      return token
    },
    async session({ session, token }) {
      session.user = { ...session.user, access_token: token.access_token ?? "" }
      return session
    },
  },
  pages: { signIn: "/login" },
})
