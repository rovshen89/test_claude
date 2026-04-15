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
