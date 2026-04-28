# backend/conftest.py
# Root-level conftest: mock WeasyPrint before any app imports so tests can run
# without the native gobject/pango shared libraries being installed.
import sys
from unittest.mock import MagicMock

# Stub out weasyprint and its sub-modules that fail to import on this machine
# due to missing native libraries (libgobject-2.0-0, libpango, etc.)
_weasyprint_mock = MagicMock()
sys.modules.setdefault("weasyprint", _weasyprint_mock)
sys.modules.setdefault("weasyprint.css", _weasyprint_mock)
sys.modules.setdefault("weasyprint.css.computed_values", _weasyprint_mock)
sys.modules.setdefault("weasyprint.text", _weasyprint_mock)
sys.modules.setdefault("weasyprint.text.ffi", _weasyprint_mock)
