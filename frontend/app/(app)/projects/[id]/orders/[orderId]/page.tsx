import { auth } from "@/lib/auth"
import { getOrder, ApiError, type Order } from "@/lib/api"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"

function fmt(n: number): string {
  return n.toFixed(2)
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string; orderId: string }>
}) {
  const { id, orderId } = await params
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token

  let order!: Order
  try {
    order = await getOrder(token, orderId)
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound()
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    throw e
  }

  const pricing = order.pricing_snapshot
  const bom = order.bom_snapshot

  return (
    <div className="max-w-4xl">
      <div className="mb-4">
        <Link href={`/projects/${id}`} className="text-xs text-indigo-400 hover:text-indigo-300">
          ← Back to project
        </Link>
      </div>

      <div className="flex flex-wrap items-baseline gap-4 mb-6">
        <h1 className="text-lg font-semibold text-slate-50">Order</h1>
        <span className="text-xs font-mono text-slate-500">{order.id}</span>
        <span className="text-xs text-slate-500">
          {new Date(order.created_at).toLocaleDateString()}
        </span>
      </div>

      {/* Pricing summary */}
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

      {/* BOM panels */}
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

      {/* BOM hardware — rendered only when non-empty */}
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

      {/* Downloads */}
      <section className="bg-slate-800 border border-slate-700 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-slate-300 mb-4">Downloads</h2>
        <div className="flex gap-3">
          <a
            href={order.export_urls.dxf}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-md bg-slate-700 hover:bg-slate-600 text-sm text-slate-200 font-medium transition-colors"
          >
            Download DXF
          </a>
          <a
            href={order.export_urls.pdf}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-md bg-slate-700 hover:bg-slate-600 text-sm text-slate-200 font-medium transition-colors"
          >
            Download PDF
          </a>
        </div>
      </section>
    </div>
  )
}
