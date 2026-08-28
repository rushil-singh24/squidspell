from app._ml_bridge import (
    RESULTS_DIR,
    FrameResult,
    InferenceEngine,
    load_motion_model,
    load_static_model,
)


class _FakeStatic:
    classes = ["A"]

    def predict(self, landmarks):
        return ("A", 1.0)


class _FakeMotion:
    classes = ["J", "Z", "negative"]

    def predict(self, frames):
        return ("negative", 1.0)


def test_bridge_reexports_are_callable_and_constructible():
    assert callable(load_static_model)
    assert callable(load_motion_model)
    engine = InferenceEngine(_FakeStatic(), _FakeMotion())
    result = engine.process_frame(None, 0.0)
    assert isinstance(result, FrameResult)
    assert result.committed_letter is None


def test_results_dir_points_at_ml_results():
    assert RESULTS_DIR.name == "results"
    assert RESULTS_DIR.parent.name == "ml"
