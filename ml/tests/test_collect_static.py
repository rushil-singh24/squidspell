import csv
import os

import pytest

from collect_static import STATIC_LETTERS, append_rows_to_csv, run_static_collection


def test_static_letters_excludes_j_and_z():
    assert "J" not in STATIC_LETTERS
    assert "Z" not in STATIC_LETTERS
    assert len(STATIC_LETTERS) == 24


def _landmarks():
    return [(0.1, 0.2, 0.3)] * 21


def test_run_static_collection_keeps_only_confident_frames():
    frames = ["f1", "f2", "f3", "f4"]

    def hand_processor(frame):
        # f1: confident, f2: low confidence, f3: no hand, f4: confident
        return {
            "f1": (_landmarks(), 0.9),
            "f2": (_landmarks(), 0.2),
            "f3": (None, None),
            "f4": (_landmarks(), 0.95),
        }[frame]

    rows = run_static_collection("A", num_frames=10, confidence_threshold=0.7,
                                  frame_source=iter(frames), hand_processor=hand_processor)
    assert len(rows) == 2
    assert all(row[0] == "A" for row in rows)


def test_run_static_collection_stops_at_num_frames():
    frames = ["f"] * 500

    def hand_processor(_frame):
        return _landmarks(), 0.99

    rows = run_static_collection("B", num_frames=5, confidence_threshold=0.7,
                                  frame_source=iter(frames), hand_processor=hand_processor)
    assert len(rows) == 5


def test_run_static_collection_invalid_letter_raises():
    with pytest.raises(ValueError):
        run_static_collection("J", num_frames=5, confidence_threshold=0.7,
                               frame_source=iter([]), hand_processor=lambda f: (None, None))


def test_run_static_collection_calls_on_progress():
    frames = ["f", "f"]
    calls = []

    def hand_processor(_frame):
        return _landmarks(), 0.99

    run_static_collection("A", num_frames=2, confidence_threshold=0.7,
                           frame_source=iter(frames), hand_processor=hand_processor,
                           on_progress=lambda collected, total: calls.append((collected, total)))
    assert calls == [(1, 2), (2, 2)]


def test_append_rows_to_csv_writes_header_once(tmp_path):
    csv_path = str(tmp_path / "out.csv")
    append_rows_to_csv([["A"] + [0.0] * 63], csv_path)
    append_rows_to_csv([["A"] + [0.0] * 63], csv_path)

    with open(csv_path, newline="") as f:
        rows = list(csv.reader(f))
    assert rows[0][0] == "label"
    assert len(rows) == 3  # header + 2 data rows
    assert rows.count(rows[0]) == 1  # header appears exactly once
