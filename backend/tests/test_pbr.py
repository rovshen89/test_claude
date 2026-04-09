import io
import zipfile

import pytest
from PIL import Image

from app.core.pbr import validate_and_extract_pbr_zip


def _make_zip(maps: dict) -> bytes:
    """Build a ZIP from {filename: PIL.Image} dict."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name, img in maps.items():
            img_buf = io.BytesIO()
            img.save(img_buf, format="PNG")
            zf.writestr(name, img_buf.getvalue())
    return buf.getvalue()


def _valid_maps(width: int = 1024, height: int = 1024) -> dict:
    """Return a dict of all 4 valid PBR maps as PIL Images."""
    return {
        name: Image.new("RGB", (width, height), color=(128, 128, 128))
        for name in ("albedo.png", "normal.png", "roughness.png", "ao.png")
    }


def test_valid_zip_returns_four_maps():
    zip_bytes = _make_zip(_valid_maps())
    result = validate_and_extract_pbr_zip(zip_bytes)
    assert set(result.keys()) == {"albedo.png", "normal.png", "roughness.png", "ao.png"}
    assert all(isinstance(v, bytes) for v in result.values())


def test_missing_map_raises_value_error():
    maps = _valid_maps()
    del maps["ao.png"]
    zip_bytes = _make_zip(maps)
    with pytest.raises(ValueError, match="Missing PBR maps"):
        validate_and_extract_pbr_zip(zip_bytes)


def test_low_resolution_raises_value_error():
    maps = _valid_maps(width=512, height=512)
    zip_bytes = _make_zip(maps)
    with pytest.raises(ValueError, match="at least 1024x1024"):
        validate_and_extract_pbr_zip(zip_bytes)


def test_invalid_zip_raises_value_error():
    with pytest.raises(ValueError, match="not a valid ZIP"):
        validate_and_extract_pbr_zip(b"this-is-not-a-zip")


def test_returns_bytes_for_each_map():
    zip_bytes = _make_zip(_valid_maps())
    result = validate_and_extract_pbr_zip(zip_bytes)
    # Verify each value is valid PNG bytes (starts with PNG magic bytes)
    for name, data in result.items():
        assert data[:8] == b"\x89PNG\r\n\x1a\n", f"{name} is not a valid PNG"


def test_mixed_case_filenames_are_normalised():
    """ZIP with uppercase filenames should still work."""
    maps = {
        name: Image.new("RGB", (1024, 1024), color=(128, 128, 128))
        for name in ("Albedo.PNG", "Normal.PNG", "Roughness.PNG", "AO.PNG")
    }
    zip_bytes = _make_zip(maps)
    result = validate_and_extract_pbr_zip(zip_bytes)
    assert set(result.keys()) == {"albedo.png", "normal.png", "roughness.png", "ao.png"}
