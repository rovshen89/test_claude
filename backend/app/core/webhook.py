# backend/app/core/webhook.py
from typing import Optional

from app.models.order import Order

SUPPORTED_FIELDS = {
    "order_id",
    "configuration_id",
    "pricing_snapshot",
    "bom_snapshot",
    "export_urls",
    "created_at",
}


def build_payload(order: Order, crm_config: Optional[dict]) -> dict:
    """Build the webhook POST body from the order and tenant crm_config.

    If crm_config is None or payload_fields is absent, all supported fields are included.
    Unrecognised field names in payload_fields are silently ignored.
    """
    raw_fields = (crm_config or {}).get("payload_fields")
    configured = raw_fields if raw_fields else list(SUPPORTED_FIELDS)
    fields = set(configured) & SUPPORTED_FIELDS
    mapping = {
        "order_id": str(order.id),
        "configuration_id": str(order.configuration_id),
        "pricing_snapshot": order.pricing_snapshot,
        "bom_snapshot": order.bom_snapshot,
        "export_urls": order.export_urls,
        "created_at": order.created_at.isoformat(),
    }
    return {f: mapping[f] for f in fields}


def extract_crm_ref(response_json: dict, crm_config: Optional[dict]) -> Optional[str]:
    """Extract crm_ref from the CRM JSON response using crm_ref_path.

    Returns None if crm_ref_path is not configured or the key is absent.
    """
    path = (crm_config or {}).get("crm_ref_path")
    if not path:
        return None
    value = response_json.get(path)
    return str(value) if value is not None else None
