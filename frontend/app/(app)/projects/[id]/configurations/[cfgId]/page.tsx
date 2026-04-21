import { auth } from "@/lib/auth"
import {
  getProject,
  getConfiguration,
  getFurnitureType,
  listMaterials,
  ApiError,
  type Project,
  type Configuration,
  type FurnitureType,
  type Material,
} from "@/lib/api"
import { redirect, notFound } from "next/navigation"
import { ConfigurationViewer } from "./_components/ConfigurationViewer"

export default async function ConfigurationViewerPage({
  params,
}: {
  params: Promise<{ id: string; cfgId: string }>
}) {
  const { id, cfgId } = await params
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token

  // Fetch project and configuration in parallel.
  // `project` is fetched for authorization: the backend returns 404 for any
  // configuration whose project is owned by a different user, so this call
  // validates ownership without the frontend needing to compare IDs.
  let project!: Project
  let configuration!: Configuration
  try {
    ;[project, configuration] = await Promise.all([
      getProject(token, id),
      getConfiguration(token, cfgId),
    ])
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound()
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    throw e
  }

  // Drafts have no viewer — redirect to project page
  if (configuration.status === "draft") redirect(`/projects/${id}`)

  // Fetch furniture type now that we have the ID from the configuration
  let furnitureType!: FurnitureType
  try {
    furnitureType = await getFurnitureType(token, configuration.furniture_type_id)
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound()
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    throw e
  }

  // Fetch materials for the panel assignment UI.
  // Non-critical: viewer renders without material pickers if this fails.
  let materials: Material[] = []
  try {
    materials = await listMaterials(token)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    // Other errors: silently fall back to empty list
  }

  const isReadOnly =
    configuration.status === "in_production" || configuration.status === "completed"

  // Cancel the (app) layout's p-6 padding so ConfigurationViewer fills the viewport
  return (
    <div className="-m-6">
      <ConfigurationViewer
        configuration={configuration}
        furnitureType={furnitureType}
        projectId={id}
        isReadOnly={isReadOnly}
        materials={materials}
      />
    </div>
  )
}
