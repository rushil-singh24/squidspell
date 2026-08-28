"""Load the Phase 2 classifiers and wrap them in predictors that own the
feature-engineering dispatch. Pure except for `joblib.load` on an explicit
path — no webcam, no mediapipe. Phase 4's backend imports this module
verbatim instead of re-deriving the load/predict logic.

Bundle shapes (see DECISIONS.md [Phase 2]):
  static_model.pkl = {"model", "feature_set", "classes"}   # feature_set == "engineered"
  motion_model.pkl = {"model", "classes"}                  # always engineered motion features
"""
from __future__ import annotations

import os

import joblib

from collection_utils import flatten_landmarks, resample_sequence
from features_motion import extract_motion_features
from features_static import extract_static_features

MOTION_RESAMPLE_LEN = 20

_DEFAULT_STATIC_PATH = os.path.join(os.path.dirname(__file__), "models", "static_model.pkl")
_DEFAULT_MOTION_PATH = os.path.join(os.path.dirname(__file__), "models", "motion_model.pkl")


def _confidence(model, feature_row):
    proba = model.predict_proba([feature_row])[0]
    best_i = max(range(len(proba)), key=lambda i: proba[i])
    return str(model.classes_[best_i]), float(proba[best_i])


class StaticPredictor:
    """Per-frame static-letter prediction from 21 (x, y, z) landmark tuples."""

    def __init__(self, model, feature_set, classes):
        self._model = model
        self._feature_set = feature_set
        self.classes = list(classes)

    def predict(self, landmarks):
        if self._feature_set == "engineered":
            row = extract_static_features(landmarks)
        elif self._feature_set == "raw":
            row = flatten_landmarks(landmarks)
        else:
            raise ValueError(f"unknown static feature_set: {self._feature_set!r}")
        return _confidence(self._model, row)


class MotionPredictor:
    """Trajectory prediction from a raw (un-resampled) segment of >=2 landmark frames.
    Resamples to MOTION_RESAMPLE_LEN before feature extraction — mandatory, the
    motion features are frame-count sensitive (see DECISIONS.md [Phase 2])."""

    def __init__(self, model, classes):
        self._model = model
        self.classes = list(classes)

    def predict(self, frames):
        if len(frames) < 2:
            raise ValueError("motion prediction needs at least 2 frames")
        resampled = resample_sequence(frames, target_len=MOTION_RESAMPLE_LEN)
        row = extract_motion_features(resampled)
        return _confidence(self._model, row)


def load_static_model(path: str = _DEFAULT_STATIC_PATH) -> StaticPredictor:
    bundle = joblib.load(path)
    return StaticPredictor(bundle["model"], bundle["feature_set"], bundle["classes"])


def load_motion_model(path: str = _DEFAULT_MOTION_PATH) -> MotionPredictor:
    bundle = joblib.load(path)
    return MotionPredictor(bundle["model"], bundle["classes"])
