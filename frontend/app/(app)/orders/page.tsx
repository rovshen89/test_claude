import { auth } from "@/lib/auth"
import {
  listOrders,
  ApiError,
  type Order,
} from "@/lib/api"
import { redirect } from "next/navigation"
import Link from "next/link"

function fmt(n: number): string {
  return n.toFixed(2)
}

export default async function OrdersPage() {
  const session = await auth()
  if (!session?.user?.access_token) redirect("/login")
  const token = session.user.access_token

  let orders: Order[] = []
  try {
    orders = await listOrders(token)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login")
    throw e
  }

  return (
    <div>
      <h1 className="text-lg font-semibold text-slate-50 mb-6">Orders</h1>
      {orders.length === 0 ? (
        <p className="text-slate-500 text-sm">No orders yet.</p>
      ) : (
        <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">Order ID</th>
                <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">Date</th>
                <th className="text-right text-xs text-slate-400 font-medium px-4 py-3">Total</th>
                <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">CRM Ref</th>
                <th className="text-right text-xs text-slate-400 font-medium px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-slate-700">
                  <td className="px-4 py-3">
                    <span
                      className="text-xs font-mono text-slate-400"
                      title={order.id}
                    >
                      {order.id.slice(0, 8)}…
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-300 text-xs">
                    {new Date(order.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-200 text-sm">
                    ${fmt(order.pricing_snapshot.total)}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {order.crm_ref ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/projects/${order.project_id}/orders/${order.id}`}
                      className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
