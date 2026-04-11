# backend/tests/test_webhook.py
import uuid
from datetime import datetime, timezone

from app.core.webhook import build_payload, extract_crm_ref
from app.models.order import Order


def _make_order() -> Order:
    return Order(
        id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
        configuration_id=uuid.UUID("00000000-0000-0000-0000-000000000002"),
        pricing_snapshot={"total": 100.0},
        bom_snapshot={"panels": []},
        export_urls={"dxf": "http://s3/out.dxf", "pdf": "http://s3/out.pdf"},
        crm_ref=None,
        last_dispatch=None,
        created_at=datetime(2026, 4, 11, tzinfo=timezone.utc),
    )


def test_build_payload_uses_configured_fields():
    order = _make_order()
    crm_config = {"payload_fields": ["order_id", "export_urls"]}
    payload = build_payload(order, crm_config)
    assert set(payload.keys()) == {"order_id", "export_urls"}
    assert payload["order_id"] == str(order.id)
    assert payload["export_urls"] == order.export_urls


def test_build_payload_defaults_to_all_supported_fields_when_config_is_none():
    order = _make_order()
    payload = build_payload(order, None)
    assert "order_id" in payload
    assert "configuration_id" in payload
    assert "pricing_snapshot" in payload
    assert "bom_snapshot" in payload
    assert "export_urls" in payload
    assert "created_at" in payload


def test_build_payload_ignores_unknown_fields():
    order = _make_order()
    crm_config = {"payload_fields": ["order_id", "not_a_real_field"]}
    payload = build_payload(order, crm_config)
    assert set(payload.keys()) == {"order_id"}


def test_extract_crm_ref_returns_value_at_configured_key():
    crm_config = {"crm_ref_path": "id"}
    result = extract_crm_ref({"id": "CRM-123"}, crm_config)
    assert result == "CRM-123"


def test_extract_crm_ref_returns_none_when_key_absent():
    crm_config = {"crm_ref_path": "id"}
    result = extract_crm_ref({"other_key": "value"}, crm_config)
    assert result is None


def test_extract_crm_ref_returns_none_when_no_path_configured():
    result = extract_crm_ref({"id": "CRM-123"}, None)
    assert result is None


def test_extract_crm_ref_coerces_integer_to_string():
    crm_config = {"crm_ref_path": "id"}
    result = extract_crm_ref({"id": 123}, crm_config)
    assert result == "123"


def test_extract_crm_ref_returns_none_for_empty_string_path():
    crm_config = {"crm_ref_path": ""}
    result = extract_crm_ref({"id": "CRM-123"}, crm_config)
    assert result is None
