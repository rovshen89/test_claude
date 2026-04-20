import {
  ApiError,
  getProjects,
  getProject,
  createProject,
  listConfigurations,
  getFurnitureType,
  getFurnitureTypes,
  createConfiguration,
  confirmConfiguration,
  getConfiguration,
  updateConfiguration,
  createOrder,
  getOrder,
  listOrders,
  listMaterials,
  type Order,
  type AppliedConfig,
  type Material,
} from "@/lib/api"

const mockFetch = jest.fn()
global.fetch = mockFetch

beforeEach(() => {
  mockFetch.mockReset()
  process.env.BACKEND_URL = "http://localhost:8000"
})

describe("ApiError", () => {
  it("stores status and message", () => {
    const e = new ApiError(404, "not found")
    expect(e.status).toBe(404)
    expect(e.message).toBe("not found")
    expect(e).toBeInstanceOf(Error)
    expect(e.name).toBe("ApiError")
  })
})

describe("getProjects", () => {
  it("calls GET /projects with Authorization header and returns array", async () => {
    const fixture = [{ id: "p1", name: "A", user_id: "u1", room_schema: null, created_at: "", updated_at: "" }]
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => fixture })

    const result = await getProjects("tok")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/projects",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      })
    )
    expect(result).toEqual(fixture)
  })

  it("throws ApiError on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, text: async () => "Unauthorized" })
    await expect(getProjects("bad")).rejects.toMatchObject({ status: 401 })
  })
})

describe("getProject", () => {
  it("calls GET /projects/{id}", async () => {
    const fixture = { id: "p1", name: "A", user_id: "u1", room_schema: null, created_at: "", updated_at: "" }
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => fixture })

    const result = await getProject("tok", "p1")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/projects/p1",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      })
    )
    expect(result.id).toBe("p1")
  })

  it("throws ApiError(404) on 404", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, text: async () => "not found" })
    await expect(getProject("tok", "x")).rejects.toMatchObject({ status: 404 })
  })
})

describe("createProject", () => {
  it("calls POST /projects with name in body", async () => {
    const fixture = { id: "p2", name: "New", user_id: "u1", room_schema: null, created_at: "", updated_at: "" }
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => fixture })

    const result = await createProject("tok", "New")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/projects",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "New" }),
      })
    )
    expect(result.name).toBe("New")
  })
})

describe("listConfigurations", () => {
  it("includes project_id query param", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] })

    await listConfigurations("tok", "proj-123")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/configurations?project_id=proj-123",
      expect.anything()
    )
  })

  it("throws ApiError on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, text: async () => "Server Error" })
    await expect(listConfigurations("tok", "proj-123")).rejects.toMatchObject({ status: 500 })
  })
})

describe("getFurnitureType", () => {
  it("calls GET /furniture-types/{id}", async () => {
    const fixture = { id: "ft1", category: "wardrobe", schema: {}, tenant_id: null }
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => fixture })

    const result = await getFurnitureType("tok", "ft1")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/furniture-types/ft1",
      expect.anything()
    )
    expect(result.category).toBe("wardrobe")
  })

  it("throws ApiError on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, text: async () => "not found" })
    await expect(getFurnitureType("tok", "missing")).rejects.toMatchObject({ status: 404 })
  })
})

describe("getFurnitureTypes", () => {
  it("calls GET /furniture-types with Authorization header and returns array", async () => {
    const fixture = [{ id: "ft1", category: "wardrobe", schema: {}, tenant_id: null }]
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => fixture })

    const result = await getFurnitureTypes("tok")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/furniture-types",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      })
    )
    expect(result).toEqual(fixture)
  })

  it("throws ApiError on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, text: async () => "error" })
    await expect(getFurnitureTypes("tok")).rejects.toMatchObject({ status: 500 })
  })
})

describe("createConfiguration", () => {
  it("posts to /configurations with project_id, furniture_type_id, applied_config", async () => {
    const fixture = {
      id: "c1",
      project_id: "p1",
      furniture_type_id: "ft1",
      applied_config: { dimensions: { width: 900 }, panels: [], hardware_list: [] },
      placement: null,
      status: "draft",
    }
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => fixture })

    const appliedConfig: AppliedConfig = {
      dimensions: { width: 900 },
      panels: [],
      hardware_list: [],
    }
    const result = await createConfiguration("tok", "p1", "ft1", appliedConfig)

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/configurations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          project_id: "p1",
          furniture_type_id: "ft1",
          applied_config: appliedConfig,
        }),
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      })
    )
    expect(result.id).toBe("c1")
    expect(result.status).toBe("draft")
  })

  it("throws ApiError on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 422, text: async () => "bad request" })
    const appliedConfig: AppliedConfig = { dimensions: { width: 900 }, panels: [], hardware_list: [] }
    await expect(createConfiguration("tok", "p1", "ft1", appliedConfig)).rejects.toMatchObject({ status: 422 })
  })
})

describe("confirmConfiguration", () => {
  it("posts to /configurations/{id}/confirm and returns updated config", async () => {
    const fixture = {
      id: "c1",
      project_id: "p1",
      furniture_type_id: "ft1",
      applied_config: {},
      placement: null,
      status: "confirmed",
    }
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => fixture })

    const result = await confirmConfiguration("tok", "c1")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/configurations/c1/confirm",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      })
    )
    expect(result.status).toBe("confirmed")
  })

  it("throws ApiError(409) on 409 response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 409, text: async () => "already confirmed" })
    await expect(confirmConfiguration("tok", "c1")).rejects.toMatchObject({ status: 409 })
  })
})

describe("getConfiguration", () => {
  it("calls GET /configurations/{id} with Authorization header and returns Configuration", async () => {
    const fixture = {
      id: "cfg1",
      project_id: "p1",
      furniture_type_id: "ft1",
      applied_config: { width: 900 },
      placement: null,
      status: "confirmed",
    }
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => fixture })

    const result = await getConfiguration("tok", "cfg1")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/configurations/cfg1",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      })
    )
    expect(result.id).toBe("cfg1")
    expect(result.status).toBe("confirmed")
  })

  it("throws ApiError on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, text: async () => "not found" })
    await expect(getConfiguration("tok", "missing")).rejects.toMatchObject({ status: 404 })
  })
})

describe("updateConfiguration", () => {
  it("calls PUT /configurations/{id} with applied_config body and Authorization header", async () => {
    const fixture = {
      id: "cfg1",
      project_id: "p1",
      furniture_type_id: "ft1",
      applied_config: { dimensions: { width: 1000, height: 720, depth: 300 }, panels: [], hardware_list: [] },
      placement: null,
      status: "draft",
    }
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => fixture })

    const appliedConfig: AppliedConfig = {
      dimensions: { width: 1000, height: 720, depth: 300 },
      panels: [],
      hardware_list: [],
    }
    const result = await updateConfiguration("tok", "cfg1", appliedConfig)

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/configurations/cfg1",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ applied_config: appliedConfig }),
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      })
    )
    expect(result.id).toBe("cfg1")
  })

  it("throws ApiError on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => "Only draft configurations can be modified",
    })
    const appliedConfig: AppliedConfig = { dimensions: { width: 900 }, panels: [], hardware_list: [] }
    await expect(
      updateConfiguration("tok", "cfg1", appliedConfig)
    ).rejects.toMatchObject({ status: 400 })
  })
})

const orderFixture: Order = {
  id: "ord1",
  configuration_id: "cfg1",
  pricing_snapshot: {
    panel_cost: 100,
    edge_cost: 20,
    hardware_cost: 30,
    labor_cost: 10,
    subtotal: 160,
    total: 192,
    breakdown: [],
  },
  bom_snapshot: { panels: [], hardware: [], total_panels: 0, total_area_m2: 0 },
  export_urls: { dxf: "http://s3/order.dxf", pdf: "http://s3/order.pdf" },
  crm_ref: null,
  last_dispatch: null,
  created_at: "2026-04-15T10:00:00Z",
}

describe("createOrder", () => {
  it("posts to /orders with configuration_id and returns Order", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => orderFixture })

    const result = await createOrder("tok", "cfg1")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/orders",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ configuration_id: "cfg1" }),
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      })
    )
    expect(result.id).toBe("ord1")
    expect(result.pricing_snapshot.total).toBe(192)
  })

  it("throws ApiError on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 409, text: async () => "Order already exists" })
    await expect(createOrder("tok", "cfg1")).rejects.toMatchObject({ status: 409 })
  })
})

describe("getOrder", () => {
  it("calls GET /orders/{id} with Authorization header and returns Order", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => orderFixture })

    const result = await getOrder("tok", "ord1")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/orders/ord1",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      })
    )
    expect(result.id).toBe("ord1")
  })

  it("throws ApiError on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, text: async () => "not found" })
    await expect(getOrder("tok", "missing")).rejects.toMatchObject({ status: 404 })
  })
})

describe("listOrders", () => {
  it("calls GET /orders with Authorization header and returns Order[]", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [orderFixture] })

    const result = await listOrders("tok")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/orders",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      })
    )
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("ord1")
  })

  it("throws ApiError on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, text: async () => "Unauthorized" })
    await expect(listOrders("tok")).rejects.toMatchObject({ status: 401 })
  })
})

const materialFixture: Material = {
  id: "mat1",
  tenant_id: null,
  category: "laminate",
  name: "Oak Laminate",
  sku: "OAK-18",
  thickness_options: [16, 18, 22],
  price_per_m2: 12.5,
  edgebanding_price_per_mm: 0.002,
  s3_albedo: "http://s3/mat1/albedo.png",
  s3_normal: null,
  s3_roughness: null,
  s3_ao: null,
  grain_direction: "horizontal",
}

describe("listMaterials", () => {
  it("calls GET /materials with Authorization header and returns Material[]", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [materialFixture] })

    const result = await listMaterials("tok")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/materials",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      })
    )
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("mat1")
    expect(result[0].thickness_options).toEqual([16, 18, 22])
  })

  it("throws ApiError on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, text: async () => "Unauthorized" })
    await expect(listMaterials("tok")).rejects.toMatchObject({ status: 401 })
  })
})
