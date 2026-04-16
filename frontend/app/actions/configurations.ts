"use server"

import { auth } from "@/lib/auth"
import { createConfiguration, confirmConfiguration, updateConfiguration, ApiError } from "@/lib/api"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

export async function createConfigurationAction(
  projectId: string,
  furnitureTypeId: string,
  appliedConfig: Record<string, number>
): Promise<{ error: string }> {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token
  if (!projectId || !furnitureTypeId) return { error: "Invalid request" }
  try {
    await createConfiguration(token, projectId, furnitureTypeId, appliedConfig)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    if (e instanceof ApiError) return { error: e.message }
    throw e
  }
  redirect(`/projects/${projectId}`)
}

export async function confirmConfigurationAction(
  configId: string,
  projectId: string
): Promise<{ error: string } | null> {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token
  if (!configId || !projectId) return { error: "Invalid request" }
  try {
    await confirmConfiguration(token, configId)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    if (e instanceof ApiError && e.status === 409) return { error: "already_confirmed" }
    if (e instanceof ApiError) return { error: e.message }
    throw e
  }
  revalidatePath(`/projects/${projectId}`)
  // Return null to signal success to the caller. Unlike createConfigurationAction,
  // this action revalidates the current page rather than redirecting, so the caller
  // (ConfirmButton) needs an explicit success signal.
  return null
}

export async function updateConfigurationAction(
  configId: string,
  projectId: string,
  appliedConfig: Record<string, number>
): Promise<{ error: string }> {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token
  if (!configId || !projectId) return { error: "Invalid request" }
  try {
    await updateConfiguration(token, configId, appliedConfig)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    if (e instanceof ApiError) return { error: e.message }
    throw e
  }
  revalidatePath(`/projects/${projectId}`)
  redirect(`/projects/${projectId}`)
}
