import {
  ApiError,
  getProjects,
  getProject,
  createProject,
  listConfigurations,
  getFurnitureType,
  getFurnitureTypes,
  createFurnitureType,
  calculatePricing,
  generateBom,
  createConfiguration,
  confirmConfiguration,
  getConfiguration,
  updateConfiguration,
  createOrder,
  getOrder,
  listOrders,
  listMaterials,
  getMaterial,
  createMaterial,
  uploadMaterial,
  updateMaterial,
  updateRoomSchema,
  dispatchOrder,
  updateFurnitureType,
  deleteFurnitureType,
  deleteMaterial,
  deleteConfiguration,
  deleteProject,
  getTenant,
  updateTenant,
  updateProject,
  type Order,
  type AppliedConfig,
  type Material,
  type MaterialCreate,
  type MaterialUpdate,
  type DispatchResponse,
  type FurnitureTypeCreate,
  type FurnitureTypeUpdate,
  type PricingSnapshot,
  type BomSnapshot,
  type TenantSettings,
  type TenantUpdate,
  type ProjectUpdate,
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

const dispatchFixture: DispatchResponse = {
  order_id: "ord1",
  dispatched_at: "2026-04-21T12:00:00Z",
  http_status: 201,
  response_body: '{"id": "crm-789"}',
  crm_ref: "crm-789",
}

describe("dispatchOrder", () => {
  it("POSTs to /orders/{id}/dispatch with Authorization header and returns DispatchResponse", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => dispatchFixture })

    const result = await dispatchOrder("tok", "ord1")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/orders/ord1/dispatch",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      })
    )
    expect(result.order_id).toBe("ord1")
    expect(result.http_status).toBe(201)
    expect(result.crm_ref).toBe("crm-789")
  })

  it("throws ApiError on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      text: async () => "No webhook URL configured for this tenant",
    })
    await expect(dispatchOrder("tok", "ord1")).rejects.toMatchObject({ status: 422 })
  })
})

describe("getMaterial", () => {
  it("calls GET /materials/{id} with Authorization header and returns Material", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => materialFixture })

    const result = await getMaterial("tok", "mat1")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/materials/mat1",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      })
    )
    expect(result.id).toBe("mat1")
    expect(result.name).toBe("Oak Laminate")
  })

  it("throws ApiError on 404", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, text: async () => "Material not found" })
    await expect(getMaterial("tok", "mat1")).rejects.toMatchObject({ status: 404 })
  })
})

describe("createMaterial", () => {
  it("POSTs to /materials with JSON body and Authorization header, returns Material", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => materialFixture })

    const data: MaterialCreate = {
      category: "sheet",
      name: "Oak Veneer",
      sku: "OAK-001",
      thickness_options: [16, 18],
      price_per_m2: 45,
      grain_direction: "vertical",
    }
    const result = await createMaterial("tok", data)

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/materials",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer tok",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify(data),
      })
    )
    expect(result.id).toBe("mat1")
  })

  it("throws ApiError on 403", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403, text: async () => "Forbidden" })
    await expect(createMaterial("tok", {
      category: "sheet",
      name: "X",
      sku: "X",
      thickness_options: [18],
      price_per_m2: 10,
      grain_direction: "none",
    })).rejects.toMatchObject({ status: 403 })
  })
})

describe("uploadMaterial", () => {
  it("POSTs to /materials/upload with Authorization header but no Content-Type, returns Material", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => materialFixture })

    const fd = new FormData()
    fd.append("name", "Oak Veneer")
    const result = await uploadMaterial("tok", fd)

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/materials/upload",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
        body: fd,
      })
    )
    const callHeaders = (mockFetch.mock.calls[0][1] as RequestInit).headers as Record<string, string>
    expect(callHeaders["Content-Type"]).toBeUndefined()
    expect(result.id).toBe("mat1")
  })

  it("throws ApiError on 422", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 422, text: async () => "Invalid ZIP" })
    await expect(uploadMaterial("tok", new FormData())).rejects.toMatchObject({ status: 422 })
  })
})

describe("updateMaterial", () => {
  it("PUTs to /materials/{id} with JSON body and Authorization header, returns Material", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => materialFixture })

    const data: MaterialUpdate = { name: "Oak Veneer Updated", price_per_m2: 50 }
    const result = await updateMaterial("tok", "mat1", data)

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/materials/mat1",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          Authorization: "Bearer tok",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify(data),
      })
    )
    expect(result.id).toBe("mat1")
  })

  it("throws ApiError on 404", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, text: async () => "Material not found" })
    await expect(updateMaterial("tok", "mat1", { name: "X" })).rejects.toMatchObject({ status: 404 })
  })
})

describe("createFurnitureType", () => {
  it("POSTs to /furniture-types with JSON body and Authorization header, returns FurnitureType", async () => {
    const fixture = { id: "ft1", category: "wardrobe", schema: { dimensions: {} }, tenant_id: null }
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => fixture })

    const data: FurnitureTypeCreate = {
      category: "wardrobe",
      schema: { dimensions: { width: { min: 300, max: 1200, step: 10, default: 600 } } },
    }
    const result = await createFurnitureType("tok", data)

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/furniture-types",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer tok",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify(data),
      })
    )
    expect(result.id).toBe("ft1")
    expect(result.category).toBe("wardrobe")
    expect(result.schema).toEqual({ dimensions: {} })
    expect(result.tenant_id).toBeNull()
  })

  it("throws ApiError on 403", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403, text: async () => "Forbidden" })
    await expect(
      createFurnitureType("tok", { category: "wardrobe", schema: {} })
    ).rejects.toMatchObject({ status: 403 })
  })
})

describe("calculatePricing", () => {
  it("POSTs to /pricing/calculate with configuration_id and Authorization header, returns PricingSnapshot", async () => {
    const fixture: PricingSnapshot = {
      panel_cost: 120.5,
      edge_cost: 8.4,
      hardware_cost: 15.0,
      labor_cost: 22.0,
      subtotal: 165.9,
      total: 165.9,
      breakdown: [{ name: "Top Panel", area_m2: 0.72, panel_cost: 32.4, edge_cost: 2.1 }],
    }
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => fixture })

    const result = await calculatePricing("tok", "cfg1")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/pricing/calculate",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer tok",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ configuration_id: "cfg1" }),
      })
    )
    expect(result.total).toBe(165.9)
    expect(result.breakdown).toHaveLength(1)
    expect(result.breakdown[0].name).toBe("Top Panel")
  })

  it("throws ApiError on 422", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 422, text: async () => "Material not assigned" })
    await expect(calculatePricing("tok", "cfg1")).rejects.toMatchObject({ status: 422 })
  })
})

describe("generateBom", () => {
  it("POSTs to /bom/generate with configuration_id and Authorization header, returns BomSnapshot", async () => {
    const fixture: BomSnapshot = {
      panels: [
        {
          name: "Top Panel",
          material_name: "Oak Veneer",
          material_sku: "OAK-001",
          thickness_mm: 18,
          width_mm: 900,
          height_mm: 800,
          quantity: 1,
          grain_direction: "horizontal",
          edge_left: true,
          edge_right: true,
          edge_top: false,
          edge_bottom: false,
          area_m2: 0.72,
        },
      ],
      hardware: [],
      total_panels: 1,
      total_area_m2: 0.72,
    }
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => fixture })

    const result = await generateBom("tok", "cfg1")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/bom/generate",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer tok",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ configuration_id: "cfg1" }),
      })
    )
    expect(result.total_panels).toBe(1)
    expect(result.panels).toHaveLength(1)
    expect(result.panels[0].material_name).toBe("Oak Veneer")
    expect(result.total_area_m2).toBe(0.72)
  })

  it("throws ApiError on 422", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 422, text: async () => "Material not assigned" })
    await expect(generateBom("tok", "cfg1")).rejects.toMatchObject({ status: 422 })
  })
})

describe("updateRoomSchema", () => {
  it("PUTs room_schema with Authorization header and returns Project", async () => {
    const schema = { width: 3000, height: 2400, depth: 4000 }
    const fixture = {
      id: "proj-1",
      user_id: "u1",
      name: "My Project",
      room_schema: schema,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    }
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => fixture })

    const result = await updateRoomSchema("tok", "proj-1", schema)

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/projects/proj-1/room-schema",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
        body: JSON.stringify({ room_schema: schema }),
      })
    )
    expect(result.id).toBe("proj-1")
    expect(result.room_schema).toEqual(schema)
  })

  it("throws ApiError with status 404 when project not found", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => "Not found",
    })

    await expect(updateRoomSchema("tok", "bad-id", {})).rejects.toMatchObject({
      status: 404,
    })
  })
})

describe("updateFurnitureType", () => {
  it("PUTs with Authorization header and returns FurnitureType", async () => {
    const fixture = { id: "ft-1", tenant_id: null, category: "cabinet", schema: { columns: 3 } }
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => fixture })

    const result = await updateFurnitureType("tok", "ft-1", { category: "cabinet", schema: { columns: 3 } })

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/furniture-types/ft-1",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
        body: JSON.stringify({ category: "cabinet", schema: { columns: 3 } }),
      })
    )
    expect(result.category).toBe("cabinet")
  })
})

describe("deleteFurnitureType", () => {
  it("DELETEs and returns undefined for 204", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204 })

    const result = await deleteFurnitureType("tok", "ft-1")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/furniture-types/ft-1",
      expect.objectContaining({ method: "DELETE" })
    )
    expect(result).toBeUndefined()
  })
})

describe("deleteMaterial", () => {
  it("DELETEs and returns undefined for 204", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204 })

    const result = await deleteMaterial("tok", "mat-1")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/materials/mat-1",
      expect.objectContaining({ method: "DELETE" })
    )
    expect(result).toBeUndefined()
  })
})

describe("deleteConfiguration", () => {
  it("DELETEs and returns undefined for 204", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204 })

    const result = await deleteConfiguration("tok", "cfg-1")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/configurations/cfg-1",
      expect.objectContaining({ method: "DELETE" })
    )
    expect(result).toBeUndefined()
  })
})

describe("deleteProject", () => {
  it("DELETEs and returns undefined for 204", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204 })

    const result = await deleteProject("tok", "proj-1")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/projects/proj-1",
      expect.objectContaining({ method: "DELETE" })
    )
    expect(result).toBeUndefined()
  })
})

describe("getTenant", () => {
  it("GETs /tenants/me with Authorization header", async () => {
    const fixture = {
      id: "t-1",
      name: "Acme",
      margin_pct: 10,
      webhook_url: "https://example.com",
      crm_config: null,
    }
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => fixture })

    const result = await getTenant("tok")

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/tenants/me",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      })
    )
    expect(result.name).toBe("Acme")
    expect(result.margin_pct).toBe(10)
  })
})

describe("updateTenant", () => {
  it("PUTs /tenants/me with body and returns TenantSettings", async () => {
    const fixture = {
      id: "t-1",
      name: "Updated",
      margin_pct: 15,
      webhook_url: "https://hook.example.com",
      crm_config: { key: "val" },
    }
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => fixture })

    const result = await updateTenant("tok", {
      name: "Updated",
      margin_pct: 15,
      webhook_url: "https://hook.example.com",
      crm_config: { key: "val" },
    })

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/tenants/me",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
        body: JSON.stringify({
          name: "Updated",
          margin_pct: 15,
          webhook_url: "https://hook.example.com",
          crm_config: { key: "val" },
        }),
      })
    )
    expect(result.name).toBe("Updated")
    expect(result.webhook_url).toBe("https://hook.example.com")
  })

  it("handles 404 ApiError when no tenant", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => "No tenant associated with this account",
    })

    await expect(updateTenant("tok", { name: "x" })).rejects.toThrow(ApiError)
  })
})

describe("updateProject", () => {
  it("PUTs /projects/:id with Authorization header and returns Project", async () => {
    const fixture = {
      id: "p-1",
      user_id: "u-1",
      name: "Renamed",
      room_schema: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    }
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => fixture })

    const result = await updateProject("tok", "p-1", { name: "Renamed" })

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/projects/p-1",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
        body: JSON.stringify({ name: "Renamed" }),
      })
    )
    expect(result.name).toBe("Renamed")
  })
})
