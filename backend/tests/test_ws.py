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
    assert _valid_landmarks([[True, 0.0, 0.0]] * 21) is False   # bool coord
    assert _valid_landmarks([[float("nan"), 0.0, 0.0]] * 21) is False   # non-finite


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
        "transcript",
    }
    assert msg["transcript"] is None
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


def test_ws_non_json_text_frame_gets_error_and_survives(ws_app):
    with TestClient(ws_app) as c:
        with c.websocket_connect("/ws/predict") as ws:
            ws.send_text("not json at all")
            err = ws.receive_json()
            assert "error" in err and "timestamp" in err
            ws.send_json({"landmarks": None})
            ok = ws.receive_json()
            assert "error" not in ok and ok["static_label"] is None


def test_ws_non_object_json_gets_error_and_survives(ws_app):
    with TestClient(ws_app) as c:
        with c.websocket_connect("/ws/predict") as ws:
            ws.send_json([1, 2, 3])
            err = ws.receive_json()
            assert "error" in err
            ws.send_json({"landmarks": None})
            assert "error" not in ws.receive_json()


def test_ws_binary_frame_gets_error_and_survives(ws_app):
    with TestClient(ws_app) as c:
        with c.websocket_connect("/ws/predict") as ws:
            ws.send_bytes(b"\x00\x01\x02")
            err = ws.receive_json()
            assert "error" in err
            ws.send_json({"landmarks": None})
            assert "error" not in ws.receive_json()


def test_ws_transcript_null_until_train_mode(ws_app):
    with TestClient(ws_app) as c:
        with c.websocket_connect("/ws/predict") as ws:
            ws.send_json({"landmarks": None})
            msg = ws.receive_json()
            assert msg["transcript"] is None


def test_ws_train_mode_makes_transcript_a_string(ws_app, monkeypatch):
    ticks = iter(range(0, 20_000, 40))  # 40 ms per frame, monotonic
    monkeypatch.setattr("app.main.time.monotonic", lambda: next(ticks) / 1000.0)
    with TestClient(ws_app) as c:
        with c.websocket_connect("/ws/predict") as ws:
            ws.send_json({"mode": "train"})
            ws.send_json({"landmarks": None})
            msg = ws.receive_json()
            assert msg["transcript"] == ""

            # space on an empty transcript is a no-op (no leading space)
            ws.send_json({"action": "space"})
            ws.send_json({"landmarks": None})
            assert ws.receive_json()["transcript"] == ""

            # drive a real commit of "A"
            transcripts = []
            for _ in range(40):
                ws.send_json({"landmarks": _frame()})
                transcripts.append(ws.receive_json()["transcript"])
            assert "A" in transcripts

            # delete removes it
            ws.send_json({"action": "delete"})
            ws.send_json({"landmarks": _frame()})
            assert ws.receive_json()["transcript"] == ""


def test_ws_unknown_mode_and_action_error_keep_open(ws_app):
    with TestClient(ws_app) as c:
        with c.websocket_connect("/ws/predict") as ws:
            ws.send_json({"mode": "sideways"})
            assert "error" in ws.receive_json()
            ws.send_json({"action": "explode"})
            assert "error" in ws.receive_json()
            ws.send_json({"landmarks": None})
            ok = ws.receive_json()
            assert "error" not in ok and ok["transcript"] is None


def test_ws_mode_frame_not_treated_as_landmarks(ws_app):
    with TestClient(ws_app) as c:
        with c.websocket_connect("/ws/predict") as ws:
            ws.send_json({"mode": "train"})
            ws.send_json({"landmarks": None})
            msg = ws.receive_json()
            # exactly one response: the mode frame produced no outbound frame
            assert msg["transcript"] == "" and "static_label" in msg


def test_ws_connections_are_isolated(ws_app, monkeypatch):
    ticks = iter(range(0, 1_000_000, 40))  # shared monotonic stream, 40 ms/frame
    monkeypatch.setattr("app.main.time.monotonic", lambda: next(ticks) / 1000.0)

    def send_frame(ws):
        ws.send_json({"landmarks": _frame()})
        return ws.receive_json()

    with TestClient(ws_app) as c:
        with c.websocket_connect("/ws/predict") as ws1, c.websocket_connect("/ws/predict") as ws2:
            ws1_committed = any(send_frame(ws1)["prediction"] is not None for _ in range(25))
            assert ws1_committed, "ws1 should commit after its own stability window"
            # ws2 has its own fresh engine: it must reach its OWN first commit,
            # not inherit ws1's already-committed smoother state.
            ws2_committed = any(send_frame(ws2)["prediction"] is not None for _ in range(25))
            assert ws2_committed, "ws2 must commit independently — proves per-connection engine isolation"
