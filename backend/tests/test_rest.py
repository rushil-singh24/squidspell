import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.prediction import PredictionService
from tests.conftest import FakeMotion, FakeStatic

_STATIC_PKL = Path(__file__).resolve().parents[2] / "ml" / "models" / "static_model.pkl"
_MOTION_PKL = Path(__file__).resolve().parents[2] / "ml" / "models" / "motion_model.pkl"


@pytest.fixture
def client():
    app = create_app(service=PredictionService(FakeStatic(), FakeMotion()))
    with TestClient(app) as c:
        yield c


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_models(client):
    r = client.get("/models")
    assert r.status_code == 200
    body = r.json()
    assert body["static"]["algorithm"] == "FakeStatic"
    assert body["static"]["feature_set"] == "engineered"
    assert body["motion"]["classes"] == ["J", "Z", "negative"]


def test_metrics(client):
    r = client.get("/metrics")
    assert r.status_code == 200
    body = r.json()
    assert "static" in body and "motion" in body
    assert isinstance(body["static"], list) and isinstance(body["motion"], list)


def test_create_app_without_service_is_lazy(monkeypatch):
    # create_app() with no service must not load models at construction time
    called = {"n": 0}

    def _boom():
        called["n"] += 1
        raise AssertionError("should not load until lifespan")

    monkeypatch.setattr("app.prediction.PredictionService.load", staticmethod(_boom))
    create_app()  # constructing the app must not call .load()
    assert called["n"] == 0


@pytest.mark.skipif(
    not (_STATIC_PKL.exists() and _MOTION_PKL.exists()),
    reason="real model .pkl files not present (gitignored / regenerable)",
)
def test_real_model_load_smoke():
    app = create_app()  # real lifespan load
    with TestClient(app) as c:
        assert c.get("/health").json() == {"status": "ok"}
        info = c.get("/models").json()
        assert len(info["static"]["classes"]) == 24
        assert info["static"]["feature_set"] == "engineered"
        assert info["motion"]["classes"] == ["J", "Z", "negative"]
        assert info["static"]["test_accuracy"] is not None
