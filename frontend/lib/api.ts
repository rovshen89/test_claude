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

export type EdgeBanding = {
  left: boolean
  right: boolean
  top: boolean
  bottom: boolean
}

export type PanelSpec = {
  name: string
  material_id: string
  thickness_mm: number
  width_mm: number
  height_mm: number
  quantity: number
  grain_direction: string
  edge_banding: EdgeBanding
}

export type HardwareItem = {
  name: string
  unit_price: number
  quantity: number
}

export type AppliedConfig = {
  dimensions: Record<string, number>
  panels: PanelSpec[]
  hardware_list: HardwareItem[]
}

export type Material = {
  id: string
  tenant_id: string | null
  category: string
  name: string
  sku: string
  thickness_options: number[]
  price_per_m2: number
  edgebanding_price_per_mm: number | null
  s3_albedo: string | null
  s3_normal: string | null
  s3_roughness: string | null
  s3_ao: string | null
  grain_direction: string
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
  if (res.status === 204) return undefined as T
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
  appliedConfig: AppliedConfig
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
  appliedConfig: AppliedConfig
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
  project_id: string
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

// GET /orders — backend scopes results to the authenticated user via JWT; no project/config filter needed
export async function listOrders(token: string): Promise<Order[]> {
  return apiFetch<Order[]>("/orders", token)
}

export async function listMaterials(token: string): Promise<Material[]> {
  return apiFetch<Material[]>("/materials", token)
}

export type DispatchResponse = {
  order_id: string
  dispatched_at: string
  http_status: number
  response_body: string
  crm_ref: string | null
}

export async function dispatchOrder(token: string, orderId: string): Promise<DispatchResponse> {
  return apiFetch<DispatchResponse>(`/orders/${orderId}/dispatch`, token, { method: "POST" })
}

export type MaterialCreate = {
  category: string
  name: string
  sku: string
  thickness_options: number[]
  price_per_m2: number
  edgebanding_price_per_mm?: number | null
  grain_direction: "horizontal" | "vertical" | "none"
}

export type MaterialUpdate = {
  name?: string
  sku?: string
  category?: string
  thickness_options?: number[]
  price_per_m2?: number
  edgebanding_price_per_mm?: number | null
  grain_direction?: "horizontal" | "vertical" | "none"
}

export async function getMaterial(token: string, matId: string): Promise<Material> {
  return apiFetch<Material>(`/materials/${matId}`, token)
}

export async function createMaterial(token: string, data: MaterialCreate): Promise<Material> {
  return apiFetch<Material>("/materials", token, {
    method: "POST",
    body: JSON.stringify(data),
  })
}

// uploadMaterial does NOT use apiFetch — must NOT set Content-Type so fetch auto-adds multipart boundary
export async function uploadMaterial(token: string, formData: FormData): Promise<Material> {
  const res = await fetch(`${process.env.BACKEND_URL}/materials/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
    cache: "no-store",
  })
  if (!res.ok) throw new ApiError(res.status, await res.text())
  return res.json() as Promise<Material>
}

export async function updateMaterial(
  token: string,
  matId: string,
  data: MaterialUpdate
): Promise<Material> {
  return apiFetch<Material>(`/materials/${matId}`, token, {
    method: "PUT",
    body: JSON.stringify(data),
  })
}

export type FurnitureTypeCreate = {
  category: string
  schema: Record<string, unknown>
}

export async function createFurnitureType(
  token: string,
  data: FurnitureTypeCreate
): Promise<FurnitureType> {
  return apiFetch<FurnitureType>("/furniture-types", token, {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export async function calculatePricing(
  token: string,
  configId: string
): Promise<PricingSnapshot> {
  return apiFetch<PricingSnapshot>("/pricing/calculate", token, {
    method: "POST",
    body: JSON.stringify({ configuration_id: configId }),
  })
}

export async function generateBom(
  token: string,
  configId: string
): Promise<BomSnapshot> {
  return apiFetch<BomSnapshot>("/bom/generate", token, {
    method: "POST",
    body: JSON.stringify({ configuration_id: configId }),
  })
}

export async function updateRoomSchema(
  token: string,
  projectId: string,
  schema: Record<string, unknown>
): Promise<Project> {
  return apiFetch<Project>(`/projects/${projectId}/room-schema`, token, {
    method: "PUT",
    body: JSON.stringify({ room_schema: schema }),
  })
}

export type FurnitureTypeUpdate = {
  category?: string
  schema?: Record<string, unknown>
}

export async function updateFurnitureType(
  token: string,
  ftId: string,
  data: FurnitureTypeUpdate
): Promise<FurnitureType> {
  return apiFetch<FurnitureType>(`/furniture-types/${ftId}`, token, {
    method: "PUT",
    body: JSON.stringify(data),
  })
}

export async function deleteFurnitureType(token: string, ftId: string): Promise<void> {
  return apiFetch<void>(`/furniture-types/${ftId}`, token, { method: "DELETE" })
}

export async function deleteMaterial(token: string, matId: string): Promise<void> {
  return apiFetch<void>(`/materials/${matId}`, token, { method: "DELETE" })
}

export async function deleteConfiguration(token: string, configId: string): Promise<void> {
  return apiFetch<void>(`/configurations/${configId}`, token, { method: "DELETE" })
}

export async function deleteProject(token: string, projectId: string): Promise<void> {
  return apiFetch<void>(`/projects/${projectId}`, token, { method: "DELETE" })
}

export type TenantSettings = {
  id: string
  name: string
  margin_pct: number
  webhook_url: string | null
  crm_config: Record<string, unknown> | null
}

export type TenantUpdate = {
  name?: string
  margin_pct?: number
  webhook_url?: string | null
  crm_config?: Record<string, unknown> | null
}

export async function getTenant(token: string): Promise<TenantSettings> {
  return apiFetch<TenantSettings>("/tenants/me", token)
}

export async function updateTenant(
  token: string,
  data: TenantUpdate
): Promise<TenantSettings> {
  return apiFetch<TenantSettings>("/tenants/me", token, {
    method: "PUT",
    body: JSON.stringify(data),
  })
}

export type ProjectUpdate = {
  name?: string
}

export async function updateProject(
  token: string,
  projectId: string,
  data: ProjectUpdate
): Promise<Project> {
  return apiFetch<Project>(`/projects/${projectId}`, token, {
    method: "PUT",
    body: JSON.stringify(data),
  })
}

export async function listAllConfigurations(token: string): Promise<Configuration[]> {
  return apiFetch<Configuration[]>("/configurations", token)
}
