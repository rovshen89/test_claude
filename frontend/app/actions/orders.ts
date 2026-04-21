"use server"

import { auth } from "@/lib/auth"
import { createOrder, dispatchOrder, ApiError, type Order, type DispatchResponse } from "@/lib/api"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

export async function createOrderAction(
  configId: string,
  projectId: string
): Promise<{ error: string }> {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token
  if (!configId || !projectId) return { error: "Invalid request" }
  let order: Order
  try {
    order = await createOrder(token, configId)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    if (e instanceof ApiError) return { error: e.message }
    throw e
  }
  revalidatePath(`/projects/${projectId}`)
  redirect(`/projects/${projectId}/orders/${order.id}`)
}

export async function dispatchOrderAction(
  orderId: string,
  projectId: string,
): Promise<{ error?: string; result?: { http_status: number; crm_ref: string | null } }> {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token
  if (!orderId || !projectId) return { error: "Invalid request" }
  let res: DispatchResponse
  try {
    res = await dispatchOrder(token, orderId)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    if (e instanceof ApiError) return { error: e.message }
    throw e
  }
  revalidatePath(`/projects/${projectId}/orders/${orderId}`)
  return { result: { http_status: res.http_status, crm_ref: res.crm_ref } }
}
