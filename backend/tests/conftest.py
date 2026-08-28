import pytest


class FakeStatic:
    """Scripted static predictor. Returns a fixed (label, confidence)."""

    algorithm = "FakeStatic"
    feature_set = "engineered"
    classes = ["A", "B", "C"]

    def __init__(self, label="A", confidence=0.9):
        self._ret = (label, confidence)

    def predict(self, landmarks):
        return self._ret


class FakeMotion:
    """Scripted motion predictor. Returns a fixed (label, confidence)."""

    algorithm = "FakeMotion"
    classes = ["J", "Z", "negative"]

    def __init__(self, label="negative", confidence=0.2):
        self._ret = (label, confidence)

    def predict(self, frames):
        return self._ret


@pytest.fixture
def fake_service():
    from app.prediction import PredictionService

    return PredictionService(FakeStatic(), FakeMotion())


@pytest.fixture
def landmark_frame():
    """A well-formed 21x3 landmark frame as nested lists (JSON-shaped)."""
    def _make(cx=0.5, cy=0.5):
        return [[cx + 0.001 * i, cy + 0.001 * i, 0.0] for i in range(21)]

    return _make
