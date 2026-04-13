import "next-auth"
import "next-auth/jwt"

declare module "next-auth" {
  interface User {
    access_token?: string
  }
  interface Session {
    user: {
      email?: string | null
      access_token: string
    }
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    access_token?: string
  }
}
