export type Project = {
  id: string
  user_id: string
  name: string
  room_schema: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export type Configuration = {
  id: string
  project_id: string
  furniture_type_id: string
  applied_config: Record<string, unknown>
  placement: Record<string, unknown> | null
  status: string
}

export type FurnitureType = {
  id: string
  tenant_id: string | null
  category: string
  schema: Record<string, unknown>
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = "ApiError"
  }
}

async function apiFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${process.env.BACKEND_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  })
  if (!res.ok) throw new ApiError(res.status, await res.text())
  return res.json() as Promise<T>
}

export async function getProjects(token: string): Promise<Project[]> {
  return apiFetch<Project[]>("/projects", token)
}

export async function getProject(token: string, id: string): Promise<Project> {
  return apiFetch<Project>(`/projects/${id}`, token)
}

export async function createProject(token: string, name: string): Promise<Project> {
  return apiFetch<Project>("/projects", token, {
    method: "POST",
    body: JSON.stringify({ name }),
  })
}

export async function listConfigurations(token: string, projectId: string): Promise<Configuration[]> {
  return apiFetch<Configuration[]>(`/configurations?project_id=${encodeURIComponent(projectId)}`, token)
}

export async function getFurnitureType(token: string, id: string): Promise<FurnitureType> {
  return apiFetch<FurnitureType>(`/furniture-types/${id}`, token)
}

export async function getFurnitureTypes(token: string): Promise<FurnitureType[]> {
  return apiFetch<FurnitureType[]>("/furniture-types", token)
}

export async function createConfiguration(
  token: string,
  projectId: string,
  furnitureTypeId: string,
  appliedConfig: Record<string, number>
): Promise<Configuration> {
  return apiFetch<Configuration>("/configurations", token, {
    method: "POST",
    body: JSON.stringify({
      project_id: projectId,
      furniture_type_id: furnitureTypeId,
      applied_config: appliedConfig,
    }),
  })
}

export async function confirmConfiguration(token: string, configId: string): Promise<Configuration> {
  return apiFetch<Configuration>(`/configurations/${configId}/confirm`, token, {
    method: "POST",
  })
}

export async function getConfiguration(token: string, configId: string): Promise<Configuration> {
  return apiFetch<Configuration>(`/configurations/${configId}`, token)
}

export async function updateConfiguration(
  token: string,
  configId: string,
  appliedConfig: Record<string, number>
): Promise<Configuration> {
  return apiFetch<Configuration>(`/configurations/${configId}`, token, {
    method: "PUT",
    body: JSON.stringify({ applied_config: appliedConfig }),
  })
}

export type PanelPricingRow = {
  name: string
  area_m2: number
  panel_cost: number
  edge_cost: number
}

export type PricingSnapshot = {
  panel_cost: number
  edge_cost: number
  hardware_cost: number
  labor_cost: number
  subtotal: number
  total: number
  breakdown: PanelPricingRow[]
}

export type BomPanelRow = {
  name: string
  material_name: string
  material_sku: string
  thickness_mm: number
  width_mm: number
  height_mm: number
  quantity: number
  grain_direction: string
  edge_left: boolean
  edge_right: boolean
  edge_top: boolean
  edge_bottom: boolean
  area_m2: number
}

export type BomHardwareRow = {
  name: string
  quantity: number
  unit_price: number
  total_price: number
}

export type BomSnapshot = {
  panels: BomPanelRow[]
  hardware: BomHardwareRow[]
  total_panels: number
  total_area_m2: number
}

export type Order = {
  id: string
  configuration_id: string
  pricing_snapshot: PricingSnapshot
  bom_snapshot: BomSnapshot
  export_urls: { dxf: string; pdf: string }
  crm_ref: string | null
  last_dispatch: Record<string, unknown> | null
  created_at: string
}

export async function createOrder(token: string, configurationId: string): Promise<Order> {
  return apiFetch<Order>("/orders", token, {
    method: "POST",
    body: JSON.stringify({ configuration_id: configurationId }),
  })
}

export async function getOrder(token: string, orderId: string): Promise<Order> {
  return apiFetch<Order>(`/orders/${orderId}`, token)
}

export async function listOrders(token: string): Promise<Order[]> {
  return apiFetch<Order[]>("/orders", token)
}
