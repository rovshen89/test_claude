import io
import zipfile

from PIL import Image

REQUIRED_MAPS = {"albedo.png", "normal.png", "roughness.png", "ao.png"}
MIN_RESOLUTION = 1024


def validate_and_extract_pbr_zip(zip_bytes: bytes) -> dict:
    """
    Validate and extract PBR maps from a ZIP file.

    Returns a dict of {filename: raw_bytes} for all 4 required maps.
    Raises ValueError on missing maps, bad resolution, or invalid ZIP.
    """
    try:
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            # Normalise to lowercase filenames from ZIP
            name_map = {name.lower(): name for name in zf.namelist()}
            missing = REQUIRED_MAPS - set(name_map.keys())
            if missing:
                raise ValueError(f"Missing PBR maps: {', '.join(sorted(missing))}")

            result = {}
            for map_name in REQUIRED_MAPS:
                raw = zf.read(name_map[map_name])
                img = Image.open(io.BytesIO(raw))
                if img.width < MIN_RESOLUTION or img.height < MIN_RESOLUTION:
                    raise ValueError(
                        f"{map_name} must be at least {MIN_RESOLUTION}x{MIN_RESOLUTION},"
                        f" got {img.width}x{img.height}"
                    )
                result[map_name] = raw
            return result
    except zipfile.BadZipFile:
        raise ValueError("File is not a valid ZIP archive")
