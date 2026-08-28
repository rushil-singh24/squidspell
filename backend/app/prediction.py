"""Loads the static + motion classifiers once per process and hands out a
fresh InferenceEngine per WebSocket connection so each client's rolling
buffer / smoother / gate state is isolated (Phase 4 acceptance criterion).
The predictor objects themselves are stateless and shared.
"""
from __future__ import annotations

import json

from app._ml_bridge import (
    RESULTS_DIR,
    InferenceEngine,
    load_motion_model,
    load_static_model,
)

STATIC_METRICS_PATH = RESULTS_DIR / "metrics.json"
MOTION_METRICS_PATH = RESULTS_DIR / "motion_metrics.json"

_METRICS_HINT = (
    "run `python ml/train_static.py` / `python ml/train_motion.py` to regenerate"
)


def _read_json_list(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        # OSError: missing file / directory / permission.
        # ValueError: json.JSONDecodeError (corrupt / truncated file).
        return None


def _best_accuracy(rows, feature_set=None):
    """Best test_accuracy across the Phase 2 comparison rows. When feature_set
    is given (static), restrict to rows at that representation so the number
    reflects the family the exported model belongs to rather than a losing
    candidate at a different feature set. This is the Phase 2 sweep's best
    score at the shipped feature set, not a live per-request metric.
    """
    accs = []
    for r in rows:
        if not isinstance(r, dict):
            continue
        if feature_set is not None and r.get("feature_set") != feature_set:
            continue
        v = r.get("test_accuracy")
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            accs.append(v)
    return max(accs) if accs else None


class PredictionService:
    def __init__(self, static_predictor, motion_predictor):
        self._static = static_predictor
        self._motion = motion_predictor

    @classmethod
    def load(cls) -> "PredictionService":
        return cls(load_static_model(), load_motion_model())

    def new_engine(self) -> InferenceEngine:
        return InferenceEngine(self._static, self._motion)

    def models_info(self) -> dict:
        static_rows = _read_json_list(STATIC_METRICS_PATH) or []
        motion_rows = _read_json_list(MOTION_METRICS_PATH) or []
        return {
            "static": {
                "algorithm": self._static.algorithm,
                "feature_set": self._static.feature_set,
                "classes": list(self._static.classes),
                "test_accuracy": _best_accuracy(static_rows, feature_set=self._static.feature_set),
            },
            "motion": {
                "algorithm": self._motion.algorithm,
                "classes": list(self._motion.classes),
                "test_accuracy": _best_accuracy(motion_rows),
            },
        }

    def metrics(self) -> dict:
        static_rows = _read_json_list(STATIC_METRICS_PATH)
        motion_rows = _read_json_list(MOTION_METRICS_PATH)
        missing = []
        if static_rows is None:
            missing.append("metrics.json")
            static_rows = []
        if motion_rows is None:
            missing.append("motion_metrics.json")
            motion_rows = []
        out = {"static": static_rows, "motion": motion_rows}
        if missing:
            out["missing"] = missing
            out["hint"] = _METRICS_HINT
        return out
