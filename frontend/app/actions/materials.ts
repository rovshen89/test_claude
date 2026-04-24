"use server"

import { auth } from "@/lib/auth"
import {
  createMaterial,
  uploadMaterial,
  updateMaterial,
  ApiError,
  type MaterialCreate,
  type MaterialUpdate,
} from "@/lib/api"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

export async function createMaterialAction(
  data: MaterialCreate
): Promise<{ error?: string }> {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token
  const canManage = session.user.role === "admin" || session.user.role === "manufacturer"
  if (!canManage) return { error: "Forbidden" }
  try {
    await createMaterial(token, data)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    if (e instanceof ApiError) return { error: e.message }
    throw e
  }
  revalidatePath("/materials")
  redirect("/materials")
}

export async function uploadMaterialAction(
  formData: FormData
): Promise<{ error?: string }> {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token
  const canManage = session.user.role === "admin" || session.user.role === "manufacturer"
  if (!canManage) return { error: "Forbidden" }
  try {
    await uploadMaterial(token, formData)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    if (e instanceof ApiError) return { error: e.message }
    throw e
  }
  revalidatePath("/materials")
  redirect("/materials")
}

export async function updateMaterialAction(
  matId: string,
  data: MaterialUpdate
): Promise<{ error?: string }> {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token
  const canManage = session.user.role === "admin" || session.user.role === "manufacturer"
  if (!canManage) return { error: "Forbidden" }
  if (!matId) return { error: "Invalid request" }
  try {
    await updateMaterial(token, matId, data)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    if (e instanceof ApiError) return { error: e.message }
    throw e
  }
  revalidatePath("/materials")
  redirect("/materials")
}
