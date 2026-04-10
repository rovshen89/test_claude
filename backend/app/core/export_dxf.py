# backend/app/core/export_dxf.py
import io

import ezdxf

from app.schemas.bom import BomResponse

_GAP_MM = 50       # horizontal gap between panels
_MAX_PER_ROW = 5   # panels per row before wrapping


def generate_dxf(bom: BomResponse) -> bytes:
    """Generate a DXF cut sheet from a BOM. Returns DXF bytes (UTF-8 encoded)."""
    doc = ezdxf.new(dxfversion="R2010")
    msp = doc.modelspace()

    cursor_x: float = 0.0
    row_y: float = 0.0
    panels_in_row: int = 0
    current_row_max_h: float = 0.0

    for panel in bom.panels:
        w = float(panel.width_mm)
        h = float(panel.height_mm)

        # Closed rectangle (4 vertices)
        msp.add_lwpolyline(
            [
                (cursor_x, row_y),
                (cursor_x + w, row_y),
                (cursor_x + w, row_y + h),
                (cursor_x, row_y + h),
            ],
            close=True,
        )

        # Text annotation
        label = (
            f"{panel.name} | {panel.width_mm}x{panel.height_mm}mm"
            f" | Qty:{panel.quantity} | T:{panel.thickness_mm}mm"
        )
        msp.add_text(
            label,
            dxfattribs={"insert": (cursor_x + 10, row_y + h - 40), "height": 25},
        )

        # Grain direction arrow (open 2-vertex LWPOLYLINE)
        if panel.grain_direction in ("horizontal", "vertical"):
            cx = cursor_x + w / 2
            cy = row_y + h / 2
            arrow_half = min(w, h) * 0.15
            if panel.grain_direction == "horizontal":
                msp.add_lwpolyline(
                    [(cx - arrow_half, cy), (cx + arrow_half, cy)],
                    close=False,
                )
            else:  # vertical
                msp.add_lwpolyline(
                    [(cx, cy - arrow_half), (cx, cy + arrow_half)],
                    close=False,
                )

        current_row_max_h = max(current_row_max_h, h)
        panels_in_row += 1

        if panels_in_row >= _MAX_PER_ROW:
            cursor_x = 0.0
            row_y -= current_row_max_h + _GAP_MM
            current_row_max_h = 0.0
            panels_in_row = 0
        else:
            cursor_x += w + _GAP_MM

    buf = io.StringIO()
    doc.write(buf)
    return buf.getvalue().encode("utf-8")
