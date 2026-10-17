import sys
from pathlib import Path

for relative in ("packages/core/src", "apps/api/src", "apps/embed/src", "apps/worker/src"):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / relative))
