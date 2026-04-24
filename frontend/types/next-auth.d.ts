import "next-auth"
import "next-auth/jwt"
import type { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface User {
    access_token?: string
    role?: string
  }
  interface Session {
    user: {
      access_token: string
      role: string
    } & DefaultSession["user"]
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    access_token?: string
    role?: string
  }
}
