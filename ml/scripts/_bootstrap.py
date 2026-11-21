"""Make `carvypaar_ml` importable when scripts are run directly (python scripts/x.py)."""
import sys
from pathlib import Path

ML_ROOT = Path(__file__).resolve().parent.parent
if str(ML_ROOT) not in sys.path:
    sys.path.insert(0, str(ML_ROOT))

# Windows consoles often default to cp1252, which can't print "₹" or "²".
for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8", errors="replace")
