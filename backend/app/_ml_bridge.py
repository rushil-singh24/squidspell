"""The one seam between backend/ and ml/.

ml/ has no __init__.py and uses bare sibling imports (`from features_static
import ...`), so it can't be imported as a package. Rather than repackage it,
we append <repo>/ml to sys.path and re-export what the backend needs. The
[Phase 0] DECISIONS entry sanctions this as the alternative to a root
pyproject.toml + `pip install -e .`. Keep every ml/ import in the backend
going through this module.
"""
import sys
from pathlib import Path

_ML_DIR = Path(__file__).resolve().parents[2] / "ml"
if str(_ML_DIR) not in sys.path:
    sys.path.append(str(_ML_DIR))

from inference import FrameResult, InferenceEngine  # noqa: E402
from model_loader import load_motion_model, load_static_model  # noqa: E402

RESULTS_DIR = _ML_DIR / "results"

__all__ = [
    "FrameResult",
    "InferenceEngine",
    "RESULTS_DIR",
    "load_motion_model",
    "load_static_model",
]
