"""Validate collected Phase 1 data against the spec's acceptance criteria.

Run after using collect_static.py / collect_motion.py to record real data:
`python validate_data.py`
"""
from __future__ import annotations

import argparse
import csv
import os
from collections import Counter

from collect_motion import MOTION_LABELS
from collect_static import STATIC_LETTERS
from collection_utils import landmark_row_header

MIN_STATIC_SAMPLES = 150
MIN_MOTION_TAKES = 40


def validate_static(csv_path):
    """Returns (ok: bool, report: list[str]) for the static-letter dataset."""
    if not os.path.exists(csv_path):
        return False, [f"MISSING: {csv_path} does not exist yet."]

    expected_header = landmark_row_header()
    with open(csv_path, newline="") as f:
        reader = csv.reader(f)
        header = next(reader, None)
        if header != expected_header:
            return False, [f"MALFORMED: header {header!r} does not match expected {expected_header!r}"]

        counts = Counter()
        malformed = 0
        for row in reader:
            if len(row) != len(expected_header):
                malformed += 1
                continue
            counts[row[0]] += 1

    ok = malformed == 0
    report = []
    if malformed:
        ok = False
        report.append(f"FAIL: {malformed} malformed row(s) found.")

    for letter in STATIC_LETTERS:
        n = counts.get(letter, 0)
        status = "OK" if n >= MIN_STATIC_SAMPLES else "FAIL"
        if status == "FAIL":
            ok = False
        report.append(f"{status}: '{letter}' has {n} samples (need >= {MIN_STATIC_SAMPLES})")

    extra = set(counts) - set(STATIC_LETTERS)
    if extra:
        ok = False
        report.append(f"FAIL: unexpected labels in dataset: {sorted(extra)}")

    return ok, report


def validate_motion(manifest_path):
    """Returns (ok: bool, report: list[str]) for the motion-sequence dataset."""
    if not os.path.exists(manifest_path):
        return False, [f"MISSING: {manifest_path} does not exist yet."]

    with open(manifest_path, newline="") as f:
        reader = csv.DictReader(f)
        counts = Counter(row["label"] for row in reader)

    ok = True
    report = []
    for label in MOTION_LABELS:
        n = counts.get(label, 0)
        status = "OK" if n >= MIN_MOTION_TAKES else "FAIL"
        if status == "FAIL":
            ok = False
        report.append(f"{status}: '{label}' has {n} takes (need >= {MIN_MOTION_TAKES})")

    extra = set(counts) - set(MOTION_LABELS)
    if extra:
        ok = False
        report.append(f"FAIL: unexpected labels in manifest: {sorted(extra)}")

    return ok, report


def main():
    parser = argparse.ArgumentParser(description="Validate Phase 1 collected data against acceptance criteria.")
    parser.add_argument("--static-csv",
                         default=os.path.join(os.path.dirname(__file__), "data", "static_landmarks.csv"))
    parser.add_argument("--motion-manifest",
                         default=os.path.join(os.path.dirname(__file__), "data", "motion_sequences", "manifest.csv"))
    args = parser.parse_args()

    static_ok, static_report = validate_static(args.static_csv)
    motion_ok, motion_report = validate_motion(args.motion_manifest)

    print("=== Static letters ===")
    print("\n".join(static_report))
    print("\n=== Motion sequences ===")
    print("\n".join(motion_report))

    overall_ok = static_ok and motion_ok
    print(f"\nOverall: {'PASS' if overall_ok else 'FAIL'}")
    raise SystemExit(0 if overall_ok else 1)


if __name__ == "__main__":
    main()
