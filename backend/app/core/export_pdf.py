# backend/app/core/export_pdf.py
import html

import weasyprint

from app.schemas.bom import BomResponse
from app.schemas.pricing import PricingResponse


def generate_pdf(bom: BomResponse, pricing: PricingResponse) -> bytes:
    """Generate a PDF order summary from BOM and pricing data. Returns PDF bytes."""
    # Build cut list rows
    panel_rows_html = ""
    for p in bom.panels:
        edges = "/".join(
            label
            for label, flag in [
                ("L", p.edge_left),
                ("R", p.edge_right),
                ("T", p.edge_top),
                ("B", p.edge_bottom),
            ]
            if flag
        ) or "—"
        panel_rows_html += (
            f"<tr>"
            f"<td>{html.escape(p.name)}</td>"
            f"<td>{html.escape(p.material_sku)}</td>"
            f"<td>{p.thickness_mm}</td>"
            f"<td>{p.width_mm}</td>"
            f"<td>{p.height_mm}</td>"
            f"<td>{p.quantity}</td>"
            f"<td>{edges}</td>"
            f"<td>{float(p.area_m2):.4f}</td>"
            f"</tr>"
        )

    # Build hardware rows
    hw_rows_html = ""
    for h in bom.hardware:
        hw_rows_html += (
            f"<tr>"
            f"<td>{html.escape(h.name)}</td>"
            f"<td>{h.quantity}</td>"
            f"<td>{float(h.unit_price):.2f}</td>"
            f"<td>{float(h.total_price):.2f}</td>"
            f"</tr>"
        )

    html_doc = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {{ font-family: sans-serif; font-size: 11px; margin: 20px; }}
  h1 {{ font-size: 16px; margin-bottom: 4px; }}
  h2 {{ font-size: 13px; margin: 12px 0 4px 0; }}
  table {{ border-collapse: collapse; width: 100%; margin-bottom: 12px; }}
  th, td {{ border: 1px solid #ccc; padding: 3px 6px; text-align: left; }}
  th {{ background: #f0f0f0; font-weight: bold; }}
</style>
</head>
<body>
<h1>Order Summary</h1>

<h2>Pricing Breakdown</h2>
<table>
  <tr><th>Item</th><th>Amount</th></tr>
  <tr><td>Panel Cost</td><td>{float(pricing.panel_cost):.2f}</td></tr>
  <tr><td>Edge Banding Cost</td><td>{float(pricing.edge_cost):.2f}</td></tr>
  <tr><td>Hardware Cost</td><td>{float(pricing.hardware_cost):.2f}</td></tr>
  <tr><td>Labor Cost</td><td>{float(pricing.labor_cost):.2f}</td></tr>
  <tr><td><strong>Subtotal</strong></td><td><strong>{float(pricing.subtotal):.2f}</strong></td></tr>
  <tr><td><strong>Total</strong></td><td><strong>{float(pricing.total):.2f}</strong></td></tr>
</table>

<h2>Cut List</h2>
<table>
  <thead>
    <tr>
      <th>Panel</th><th>SKU</th><th>T(mm)</th><th>W(mm)</th>
      <th>H(mm)</th><th>Qty</th><th>Edges</th><th>Area m²</th>
    </tr>
  </thead>
  <tbody>{panel_rows_html}</tbody>
</table>

{f'<h2>Hardware</h2><table><thead><tr><th>Item</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead><tbody>{hw_rows_html}</tbody></table>' if bom.hardware else ''}
</body>
</html>"""

    return weasyprint.HTML(string=html_doc).write_pdf()
