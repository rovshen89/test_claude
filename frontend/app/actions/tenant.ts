"use server"

import { auth } from "@/lib/auth"
import { updateTenant, ApiError, type TenantUpdate } from "@/lib/api"
import { revalidatePath } from "next/cache"

export async function updateTenantAction(
  data: TenantUpdate
): Promise<{ error?: string; success?: boolean }> {
  const session = await auth()
  if (!session?.user?.access_token) return { error: "Not authenticated" }
  const token = session.user.access_token
  try {
    await updateTenant(token, data)
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message }
    throw e
  }
  revalidatePath("/settings")
  return { success: true }
}
