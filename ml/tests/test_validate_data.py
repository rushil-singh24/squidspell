import csv
import os

from validate_data import MIN_MOTION_TAKES, MIN_STATIC_SAMPLES, validate_motion, validate_static
from collection_utils import landmark_row_header


def _write_static_csv(path, counts):
    """counts: dict of letter -> number of rows to write."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(landmark_row_header())
        for letter, n in counts.items():
            for _ in range(n):
                writer.writerow([letter] + [0.0] * 63)


def test_validate_static_missing_file_fails(tmp_path):
    ok, report = validate_static(str(tmp_path / "nope.csv"))
    assert ok is False
    assert any("MISSING" in line for line in report)


def test_validate_static_passes_when_all_letters_meet_floor(tmp_path):
    from collect_static import STATIC_LETTERS
    path = str(tmp_path / "static.csv")
    _write_static_csv(path, {letter: MIN_STATIC_SAMPLES for letter in STATIC_LETTERS})

    ok, report = validate_static(path)
    assert ok is True
    assert all("FAIL" not in line for line in report)


def test_validate_static_fails_when_one_letter_short(tmp_path):
    from collect_static import STATIC_LETTERS
    path = str(tmp_path / "static.csv")
    counts = {letter: MIN_STATIC_SAMPLES for letter in STATIC_LETTERS}
    counts["A"] = MIN_STATIC_SAMPLES - 1
    _write_static_csv(path, counts)

    ok, report = validate_static(path)
    assert ok is False
    assert any("'A'" in line and "FAIL" in line for line in report)


def test_validate_static_fails_on_malformed_row(tmp_path):
    path = str(tmp_path / "static.csv")
    with open(path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(landmark_row_header())
        writer.writerow(["A", 0.0, 0.0])  # too few columns
    ok, report = validate_static(path)
    assert ok is False
    assert any("malformed" in line.lower() for line in report)


def test_validate_motion_missing_file_fails(tmp_path):
    ok, report = validate_motion(str(tmp_path / "manifest.csv"))
    assert ok is False
    assert any("MISSING" in line for line in report)


def _write_take_file(manifest_dir, filename, num_rows=20, header=None):
    """Write a valid per-take motion CSV (no label column) into manifest_dir."""
    if header is None:
        header = landmark_row_header()[1:]
    with open(os.path.join(manifest_dir, filename), "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(header)
        for _ in range(num_rows):
            writer.writerow([0.0] * (len(header)))


def test_validate_motion_passes_when_all_classes_meet_floor(tmp_path):
    path = str(tmp_path / "manifest.csv")
    with open(path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["label", "source", "filepath", "num_raw_frames", "captured_at"])
        for label in ("J", "Z", "negative"):
            for i in range(MIN_MOTION_TAKES):
                filename = f"{label}_{i:03d}.csv"
                writer.writerow([label, label, filename, 20, i])
                _write_take_file(str(tmp_path), filename)

    ok, report = validate_motion(path)
    assert ok is True


def test_validate_motion_fails_when_one_class_short(tmp_path):
    path = str(tmp_path / "manifest.csv")
    with open(path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["label", "source", "filepath", "num_raw_frames", "captured_at"])
        for label, n in (("J", MIN_MOTION_TAKES), ("Z", MIN_MOTION_TAKES), ("negative", MIN_MOTION_TAKES - 5)):
            for i in range(n):
                filename = f"{label}_{i:03d}.csv"
                writer.writerow([label, label, filename, 20, i])
                _write_take_file(str(tmp_path), filename)

    ok, report = validate_motion(path)
    assert ok is False
    assert any("'negative'" in line and "FAIL" in line for line in report)


def test_validate_motion_fails_when_take_file_missing(tmp_path):
    path = str(tmp_path / "manifest.csv")
    with open(path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["label", "source", "filepath", "num_raw_frames", "captured_at"])
        for label in ("J", "Z", "negative"):
            for i in range(MIN_MOTION_TAKES):
                filename = f"{label}_{i:03d}.csv"
                writer.writerow([label, label, filename, 20, i])
                if not (label == "J" and i == 0):
                    _write_take_file(str(tmp_path), filename)
                # J_000.csv is referenced by the manifest but never written to disk.

    ok, report = validate_motion(path)
    assert ok is False
    assert any("J_000.csv" in line and "missing" in line.lower() for line in report)


def test_validate_motion_fails_when_take_file_has_wrong_header(tmp_path):
    path = str(tmp_path / "manifest.csv")
    with open(path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["label", "source", "filepath", "num_raw_frames", "captured_at"])
        for label in ("J", "Z", "negative"):
            for i in range(MIN_MOTION_TAKES):
                filename = f"{label}_{i:03d}.csv"
                writer.writerow([label, label, filename, 20, i])
                if label == "J" and i == 0:
                    _write_take_file(str(tmp_path), filename, header=["wrong", "header"])
                else:
                    _write_take_file(str(tmp_path), filename)

    ok, report = validate_motion(path)
    assert ok is False
    assert any("J_000.csv" in line and "malformed header" in line.lower() for line in report)
