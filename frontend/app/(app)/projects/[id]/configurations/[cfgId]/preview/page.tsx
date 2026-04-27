import { auth } from "@/lib/auth"
import {
  getConfiguration,
  calculatePricing,
  generateBom,
  ApiError,
  type PricingSnapshot,
  type BomSnapshot,
} from "@/lib/api"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { PlaceOrderButton } from "./_components/PlaceOrderButton"

function fmt(n: number): string {
  return n.toFixed(2)
}

export default async function PricingBomPreviewPage({
  params,
}: {
  params: Promise<{ id: string; cfgId: string }>
}) {
  const { id, cfgId } = await params
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token

  let configuration
  try {
    configuration = await getConfiguration(token, cfgId)
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound()
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    throw e
  }

  // Only confirmed configurations can show a preview
  if (configuration.status !== "confirmed") {
    redirect(`/projects/${id}/configurations/${cfgId}`)
  }

  let pricing: PricingSnapshot | null = null
  let bom: BomSnapshot | null = null
  let previewError: string | null = null

  try {
    ;[pricing, bom] = await Promise.all([
      calculatePricing(token, cfgId),
      generateBom(token, cfgId),
    ])
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    if (e instanceof ApiError && e.status === 422) {
      previewError = "Cannot calculate preview: not all panels have materials assigned."
    } else {
      throw e
    }
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-4">
        <Link
          href={`/projects/${id}/configurations/${cfgId}`}
          className="text-xs text-indigo-400 hover:text-indigo-300"
        >
          ← Back to configuration
        </Link>
      </div>

      <div className="flex flex-wrap items-baseline gap-4 mb-6">
        <h1 className="text-lg font-semibold text-slate-50">Pricing & BOM Preview</h1>
        <span className="text-xs text-slate-500">
          Live estimate — not locked until an order is created
        </span>
      </div>

      {previewError && (
        <div className="bg-amber-950 border border-amber-900 rounded-md px-4 py-3 text-sm text-amber-300 mb-6">
          {previewError}
        </div>
      )}

      {pricing && (
        <section className="bg-slate-800 border border-slate-700 rounded-lg p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">Pricing</h2>
          <div className="grid grid-cols-2 gap-y-2 text-sm max-w-xs">
            {(
              [
                ["Panel cost",    pricing.panel_cost],
                ["Edge cost",     pricing.edge_cost],
                ["Hardware cost", pricing.hardware_cost],
                ["Labor cost",    pricing.labor_cost],
                ["Subtotal",      pricing.subtotal],
              ] as [string, number][]
            ).map(([label, value]) => (
              <div key={label} className="contents">
                <span className="text-slate-400">{label}</span>
                <span className="text-slate-200 text-right">${fmt(value)}</span>
              </div>
            ))}
            <div className="col-span-2 border-t border-slate-700 my-1" />
            <span className="text-slate-100 font-semibold">Total</span>
            <span className="text-slate-100 font-semibold text-right">${fmt(pricing.total)}</span>
          </div>

          {pricing.breakdown.length > 0 && (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-xs text-slate-400">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-1.5 pr-4">Panel</th>
                    <th className="text-right py-1.5 pr-4">Area m²</th>
                    <th className="text-right py-1.5 pr-4">Panel cost</th>
                    <th className="text-right py-1.5">Edge cost</th>
                  </tr>
                </thead>
                <tbody>
                  {pricing.breakdown.map((row, i) => (
                    <tr key={i} className="border-b border-slate-800">
                      <td className="py-1.5 pr-4">{row.name}</td>
                      <td className="text-right py-1.5 pr-4">{fmt(row.area_m2)}</td>
                      <td className="text-right py-1.5 pr-4">${fmt(row.panel_cost)}</td>
                      <td className="text-right py-1.5">${fmt(row.edge_cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {bom && (
        <>
          <section className="bg-slate-800 border border-slate-700 rounded-lg p-5 mb-6">
            <h2 className="text-sm font-semibold text-slate-300 mb-1">Cut List</h2>
            <p className="text-xs text-slate-500 mb-4">
              {bom.total_panels} panels · {fmt(bom.total_area_m2)} m² total
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-slate-400 whitespace-nowrap">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-1.5 pr-4">Panel</th>
                    <th className="text-left py-1.5 pr-4">Material</th>
                    <th className="text-right py-1.5 pr-4">Thick</th>
                    <th className="text-right py-1.5 pr-4">W mm</th>
                    <th className="text-right py-1.5 pr-4">H mm</th>
                    <th className="text-right py-1.5 pr-4">Qty</th>
                    <th className="text-left py-1.5 pr-4">Banding</th>
                    <th className="text-right py-1.5">Area m²</th>
                  </tr>
                </thead>
                <tbody>
                  {bom.panels.map((row, i) => {
                    const banding =
                      [
                        row.edge_left && "L",
                        row.edge_right && "R",
                        row.edge_top && "T",
                        row.edge_bottom && "B",
                      ]
                        .filter(Boolean)
                        .join(", ") || "—"
                    return (
                      <tr key={i} className="border-b border-slate-800">
                        <td className="py-1.5 pr-4">{row.name}</td>
                        <td className="py-1.5 pr-4">{row.material_name}</td>
                        <td className="text-right py-1.5 pr-4">{row.thickness_mm}mm</td>
                        <td className="text-right py-1.5 pr-4">{row.width_mm}</td>
                        <td className="text-right py-1.5 pr-4">{row.height_mm}</td>
                        <td className="text-right py-1.5 pr-4">{row.quantity}</td>
                        <td className="py-1.5 pr-4">{banding}</td>
                        <td className="text-right py-1.5">{fmt(row.area_m2)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {bom.hardware.length > 0 && (
            <section className="bg-slate-800 border border-slate-700 rounded-lg p-5 mb-6">
              <h2 className="text-sm font-semibold text-slate-300 mb-4">Hardware</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-slate-400">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-1.5 pr-4">Item</th>
                      <th className="text-right py-1.5 pr-4">Qty</th>
                      <th className="text-right py-1.5 pr-4">Unit price</th>
                      <th className="text-right py-1.5">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bom.hardware.map((row, i) => (
                      <tr key={i} className="border-b border-slate-800">
                        <td className="py-1.5 pr-4">{row.name}</td>
                        <td className="text-right py-1.5 pr-4">{row.quantity}</td>
                        <td className="text-right py-1.5 pr-4">${fmt(row.unit_price)}</td>
                        <td className="text-right py-1.5">${fmt(row.total_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {!previewError && (
        <section className="bg-slate-800 border border-slate-700 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">Ready to order?</h2>
          <PlaceOrderButton configId={cfgId} projectId={id} />
        </section>
      )}
    </div>
  )
}
