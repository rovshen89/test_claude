"use server"

import { auth } from "@/lib/auth"
import {
  createFurnitureType,
  updateFurnitureType,
  deleteFurnitureType,
  ApiError,
  type FurnitureTypeCreate,
  type FurnitureTypeUpdate,
} from "@/lib/api"
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

export async function updateFurnitureTypeAction(
  ftId: string,
  data: FurnitureTypeUpdate
): Promise<{ error?: string }> {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token
  try {
    await updateFurnitureType(token, ftId, data)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    if (e instanceof ApiError) return { error: e.message }
    throw e
  }
  revalidatePath(`/furniture-types/${ftId}`)
  redirect(`/furniture-types/${ftId}`)
}

export async function deleteFurnitureTypeAction(
  ftId: string
): Promise<{ error?: string }> {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token
  try {
    await deleteFurnitureType(token, ftId)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    if (e instanceof ApiError) return { error: e.message }
    throw e
  }
  revalidatePath("/furniture-types")
  redirect("/furniture-types")
}
