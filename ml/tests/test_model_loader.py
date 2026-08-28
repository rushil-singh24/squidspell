import os

import numpy as np
import pytest

from model_loader import (
    MOTION_RESAMPLE_LEN,
    MotionPredictor,
    StaticPredictor,
    load_motion_model,
    load_static_model,
)

MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "models")
STATIC_PKL = os.path.join(MODELS_DIR, "static_model.pkl")
MOTION_PKL = os.path.join(MODELS_DIR, "motion_model.pkl")


class _FakeSklearnModel:
    """Minimal stand-in: records the feature-vector length it was called with."""

    def __init__(self, classes):
        self.classes_ = np.array(classes)
        self.last_n_features = None

    def predict_proba(self, X):
        self.last_n_features = len(X[0])
        # deterministic: put all mass on the first class
        row = np.zeros(len(self.classes_))
        row[0] = 1.0
        return np.array([row])


def _flat_hand():
    # 21 landmarks, mild spread so feature math doesn't divide by zero
    return [(0.01 * i, 0.02 * i, 0.005 * i) for i in range(21)]


def test_static_predictor_engineered_branch_uses_40_features():
    fake = _FakeSklearnModel(["A", "B"])
    pred = StaticPredictor(model=fake, feature_set="engineered", classes=["A", "B"])
    label, conf = pred.predict(_flat_hand())
    assert label == "A"
    assert conf == pytest.approx(1.0)
    assert fake.last_n_features == 40


def test_static_predictor_raw_branch_uses_63_features():
    fake = _FakeSklearnModel(["A", "B"])
    pred = StaticPredictor(model=fake, feature_set="raw", classes=["A", "B"])
    pred.predict(_flat_hand())
    assert fake.last_n_features == 63


def test_motion_predictor_resamples_then_uses_49_features():
    fake = _FakeSklearnModel(["J", "Z", "negative"])
    pred = MotionPredictor(model=fake, classes=["J", "Z", "negative"])
    # 7 raw frames -> must be resampled to 20 before feature extraction
    raw = [[(0.01 * i + 0.001 * t, 0.02 * i, 0.0) for i in range(21)] for t in range(7)]
    label, conf = pred.predict(raw)
    assert label == "J"
    assert conf == pytest.approx(1.0)
    assert fake.last_n_features == 49


def test_motion_predictor_always_resamples_to_20(monkeypatch):
    captured = []

    def spy(frames):
        captured.append(len(frames))
        return [0.0] * 49

    monkeypatch.setattr("model_loader.extract_motion_features", spy)
    fake = _FakeSklearnModel(["J", "Z", "negative"])
    pred = MotionPredictor(model=fake, classes=["J", "Z", "negative"])
    short = [[(0.01 * i, 0.0, 0.0) for i in range(21)] for _ in range(7)]
    long = [[(0.01 * i + 0.001 * t, 0.0, 0.0) for i in range(21)] for t in range(40)]
    pred.predict(short)
    pred.predict(long)
    assert captured == [20, 20]


def test_motion_resample_len_constant():
    assert MOTION_RESAMPLE_LEN == 20


@pytest.mark.skipif(not os.path.exists(STATIC_PKL), reason="static_model.pkl not present (regenerable, gitignored)")
def test_load_static_model_predicts_valid_class():
    pred = load_static_model(STATIC_PKL)
    label, conf = pred.predict(_flat_hand())
    assert label in pred.classes
    assert 0.0 <= conf <= 1.0


@pytest.mark.skipif(not os.path.exists(MOTION_PKL), reason="motion_model.pkl not present (regenerable, gitignored)")
def test_load_motion_model_predicts_valid_class():
    pred = load_motion_model(MOTION_PKL)
    raw = [[(0.01 * i + 0.002 * t, 0.02 * i, 0.0) for i in range(21)] for t in range(6)]
    label, conf = pred.predict(raw)
    assert label in pred.classes
    assert 0.0 <= conf <= 1.0
