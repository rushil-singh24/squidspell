import pytest
from fastapi.testclient import TestClient

from app.main import _to_tuples, _valid_landmarks, create_app
from app.prediction import PredictionService
from tests.conftest import FakeMotion, FakeStatic


def _frame(cx=0.5, cy=0.5):
    return [[cx + 0.001 * i, cy + 0.001 * i, 0.0] for i in range(21)]


# --- _valid_landmarks units -------------------------------------------------
def test_valid_landmarks_accepts_none_and_21_triples():
    assert _valid_landmarks(None) is True
    assert _valid_landmarks(_frame()) is True


def test_valid_landmarks_rejects_wrong_shapes():
    assert _valid_landmarks([[0.0, 0.0, 0.0]] * 20) is False   # 20 points
    assert _valid_landmarks([[0.0, 0.0]] * 21) is False        # 2-tuples
    assert _valid_landmarks("nope") is False
    assert _valid_landmarks([[0.0, 0.0, "x"]] * 21) is False   # non-numeric


def test_to_tuples_roundtrip():
    assert _to_tuples(None) is None
    out = _to_tuples(_frame())
    assert len(out) == 21 and isinstance(out[0], tuple) and len(out[0]) == 3


# --- WebSocket behaviour --------------------------------------------------
@pytest.fixture
def ws_app():
    # static always "A" @0.95; motion never fires (negative)
    return create_app(service=PredictionService(FakeStatic("A", 0.95), FakeMotion("negative", 0.1)))


def test_ws_emits_one_message_per_frame_with_schema(ws_app):
    with TestClient(ws_app) as c:
        with c.websocket_connect("/ws/predict") as ws:
            ws.send_json({"landmarks": _frame(), "t": 1730000000000})
            msg = ws.receive_json()
    assert set(msg) == {
        "prediction", "confidence", "source", "static_label",
        "static_confidence", "motion_active", "fps", "timestamp", "client_timestamp",
    }
    assert msg["static_label"] == "A"
    assert msg["static_confidence"] == 0.95
    assert msg["motion_active"] is False
    assert msg["client_timestamp"] == 1730000000000
    assert msg["prediction"] is None  # not stable yet on frame 1


def test_ws_commits_static_letter_after_stability_window(ws_app, monkeypatch):
    ticks = iter(range(0, 10_000, 40))  # 40 ms per frame, monotonic
    monkeypatch.setattr("app.main.time.monotonic", lambda: next(ticks) / 1000.0)
    committed = []
    with TestClient(ws_app) as c:
        with c.websocket_connect("/ws/predict") as ws:
            for _ in range(40):
                ws.send_json({"landmarks": _frame()})
                m = ws.receive_json()
                if m["prediction"] is not None:
                    committed.append((m["prediction"], m["source"], m["confidence"]))
    assert ("A", "static", 0.95) in committed


def test_ws_malformed_frame_returns_error_and_keeps_connection(ws_app):
    with TestClient(ws_app) as c:
        with c.websocket_connect("/ws/predict") as ws:
            ws.send_json({"landmarks": [[0.0, 0.0, 0.0]] * 5})
            err = ws.receive_json()
            assert "error" in err and "timestamp" in err
            # connection still usable
            ws.send_json({"landmarks": None})
            ok = ws.receive_json()
            assert ok["static_label"] is None and "error" not in ok


def test_ws_connections_are_isolated(ws_app):
    with TestClient(ws_app) as c:
        with c.websocket_connect("/ws/predict") as ws1, c.websocket_connect("/ws/predict") as ws2:
            # feed ws1 many frames so its smoother is primed
            for _ in range(40):
                ws1.send_json({"landmarks": _frame()})
                ws1.receive_json()
            # ws2's very first frame must still be a fresh "not stable yet"
            ws2.send_json({"landmarks": _frame()})
            first = ws2.receive_json()
            assert first["prediction"] is None
