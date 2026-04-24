"use server"

import { auth } from "@/lib/auth"
import { createFurnitureType, ApiError, type FurnitureTypeCreate } from "@/lib/api"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

export async function createFurnitureTypeAction(
  data: FurnitureTypeCreate
): Promise<{ error?: string }> {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token
  const canManage = session.user.role === "admin" || session.user.role === "manufacturer"
  if (!canManage) return { error: "Forbidden" }
  try {
    await createFurnitureType(token, data)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    if (e instanceof ApiError) return { error: e.message }
    throw e
  }
  revalidatePath("/furniture-types")
  redirect("/furniture-types")
}
