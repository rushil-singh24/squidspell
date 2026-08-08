import csv
import os

from collect_motion import MOTION_LABELS, _next_index, run_motion_capture, save_take


def _landmarks():
    return [(0.1, 0.2, 0.3)] * 21


def test_motion_labels_are_j_z_negative():
    assert MOTION_LABELS == ["J", "Z", "negative"]


def test_run_motion_capture_stops_after_window_seconds():
    # Fake clock: each call advances by 0.1s. Window is 0.5s -> ~5 calls before stopping,
    # but frame_source must also be effectively infinite for the loop to be clock-bound.
    clock = {"t": 0.0}

    def clock_fn():
        clock["t"] += 0.1
        return clock["t"]

    def infinite_frames():
        while True:
            yield "frame"

    def hand_processor(_frame):
        return _landmarks()

    frames = run_motion_capture(window_seconds=0.5, frame_source=infinite_frames(),
                                 hand_processor=hand_processor, clock_fn=clock_fn)
    assert 3 <= len(frames) <= 6  # clock starts at 0.1 after first call; loose bound on off-by-ones


def test_run_motion_capture_drops_frames_with_no_hand():
    clock = {"t": 0.0}

    def clock_fn():
        clock["t"] += 0.1
        return clock["t"]

    frame_sequence = ["hand", "no_hand", "hand", "no_hand", "hand"]

    def frame_source():
        for f in frame_sequence:
            yield f

    def hand_processor(frame):
        return _landmarks() if frame == "hand" else None

    frames = run_motion_capture(window_seconds=10.0, frame_source=frame_source(),
                                 hand_processor=hand_processor, clock_fn=clock_fn)
    assert len(frames) == 3  # only the three "hand" frames


def test_save_take_writes_resampled_rows_and_manifest(tmp_path):
    from collection_utils import landmark_row_header

    output_dir = str(tmp_path / "motion_sequences")
    resampled = [_landmarks() for _ in range(20)]

    filename = save_take("J", "J", resampled, num_raw_frames=15, output_dir=output_dir, index=0,
                          captured_at=1234567890)

    take_path = os.path.join(output_dir, filename)
    with open(take_path, newline="") as f:
        rows = list(csv.reader(f))
    assert rows[0] == landmark_row_header()[1:]  # no "label" column in a per-take file
    assert len(rows) == 21  # header + 20 data rows

    manifest_path = os.path.join(output_dir, "manifest.csv")
    with open(manifest_path, newline="") as f:
        manifest_rows = list(csv.DictReader(f))
    assert manifest_rows[0]["label"] == "J"
    assert manifest_rows[0]["source"] == "J"
    assert manifest_rows[0]["filepath"] == filename
    assert manifest_rows[0]["num_raw_frames"] == "15"  # raw count, distinct from the 20 resampled rows


def test_save_take_appends_without_duplicating_manifest_header(tmp_path):
    output_dir = str(tmp_path / "motion_sequences")
    resampled = [_landmarks() for _ in range(20)]

    save_take("J", "J", resampled, num_raw_frames=20, output_dir=output_dir, index=0, captured_at=1)
    save_take("J", "J", resampled, num_raw_frames=20, output_dir=output_dir, index=1, captured_at=2)

    with open(os.path.join(output_dir, "manifest.csv"), newline="") as f:
        rows = list(csv.reader(f))
    assert rows[0] == ["label", "source", "filepath", "num_raw_frames", "captured_at"]
    assert len(rows) == 3  # header + 2 takes


def test_next_index_uses_max_existing_suffix_not_count(tmp_path):
    output_dir = str(tmp_path / "motion_sequences")
    os.makedirs(output_dir)
    for name in ("J_000.csv", "J_001.csv", "J_002.csv"):
        with open(os.path.join(output_dir, name), "w") as f:
            f.write("")
    os.remove(os.path.join(output_dir, "J_001.csv"))

    # len(existing) would be 2 here (J_000, J_002) and collide with J_002 on the next save;
    # the correct next index is max(0, 2) + 1 = 3.
    assert _next_index(output_dir, "J") == 3
