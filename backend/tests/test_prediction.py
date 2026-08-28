import json

from app.prediction import PredictionService
from tests.conftest import FakeMotion, FakeStatic


def test_new_engine_returns_independent_instances():
    svc = PredictionService(FakeStatic(), FakeMotion())
    a = svc.new_engine()
    b = svc.new_engine()
    assert a is not b
    assert a._buffer is not b._buffer
    # driving one engine must not touch the other's buffer
    a.process_frame([[0.5, 0.5, 0.0]] * 21, 0.0)
    assert len(a._buffer) == 1
    assert len(b._buffer) == 0


def test_models_info_shape():
    svc = PredictionService(FakeStatic(), FakeMotion())
    info = svc.models_info()
    assert info["static"]["algorithm"] == "FakeStatic"
    assert info["static"]["feature_set"] == "engineered"
    assert info["static"]["classes"] == ["A", "B", "C"]
    assert info["motion"]["algorithm"] == "FakeMotion"
    assert info["motion"]["classes"] == ["J", "Z", "negative"]
    assert "test_accuracy" in info["static"] and "test_accuracy" in info["motion"]


def test_metrics_reads_files_when_present(tmp_path, monkeypatch):
    static_rows = [{"model": "random_forest", "feature_set": "engineered", "test_accuracy": 0.994}]
    motion_rows = [{"model": "random_forest", "test_accuracy": 0.893}]
    (tmp_path / "metrics.json").write_text(json.dumps(static_rows))
    (tmp_path / "motion_metrics.json").write_text(json.dumps(motion_rows))
    monkeypatch.setattr("app.prediction.STATIC_METRICS_PATH", tmp_path / "metrics.json")
    monkeypatch.setattr("app.prediction.MOTION_METRICS_PATH", tmp_path / "motion_metrics.json")

    svc = PredictionService(FakeStatic(), FakeMotion())
    m = svc.metrics()
    assert m["static"] == static_rows
    assert m["motion"] == motion_rows
    assert "missing" not in m


def test_metrics_degrades_when_files_missing(tmp_path, monkeypatch):
    monkeypatch.setattr("app.prediction.STATIC_METRICS_PATH", tmp_path / "nope.json")
    monkeypatch.setattr("app.prediction.MOTION_METRICS_PATH", tmp_path / "nope2.json")
    svc = PredictionService(FakeStatic(), FakeMotion())
    m = svc.metrics()
    assert m["static"] == [] and m["motion"] == []
    assert set(m["missing"]) == {"metrics.json", "motion_metrics.json"}
    assert "hint" in m


def test_models_info_test_accuracy_from_metrics(tmp_path, monkeypatch):
    (tmp_path / "metrics.json").write_text(json.dumps(
        [{"model": "svm", "test_accuracy": 0.85}, {"model": "random_forest", "test_accuracy": 0.99}]
    ))
    (tmp_path / "motion_metrics.json").write_text(json.dumps([{"model": "random_forest", "test_accuracy": 0.893}]))
    monkeypatch.setattr("app.prediction.STATIC_METRICS_PATH", tmp_path / "metrics.json")
    monkeypatch.setattr("app.prediction.MOTION_METRICS_PATH", tmp_path / "motion_metrics.json")
    svc = PredictionService(FakeStatic(), FakeMotion())
    info = svc.models_info()
    assert info["static"]["test_accuracy"] == 0.99
    assert info["motion"]["test_accuracy"] == 0.893
