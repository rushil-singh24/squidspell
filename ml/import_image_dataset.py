"""Turn a folder of labeled hand-sign images into rows of MediaPipe landmarks,
in the same CSV format collect_static.py produces, so a public image dataset
(e.g. Kaggle `grassknoted/asl-alphabet`) can be used to train the static
classifier without recording anything.

Expected layout (Kaggle ASL Alphabet's `asl_alphabet_train/asl_alphabet_train`):

    <images-dir>/
        A/  A1.jpg A2.jpg ...
        B/  ...
        ...

Only the 24 static letters (A-I, K-Y) are imported; J/Z (motion), and any
`del` / `space` / `nothing` folders, are skipped.

    python import_image_dataset.py --images-dir /path/to/asl_alphabet_train \
        --output data/static_landmarks.csv --limit-per-letter 600
"""
from __future__ import annotations

import argparse
import csv
import os
import random

from collection_utils import landmark_row_header, landmarks_to_row

STATIC_LETTERS = [c for c in "ABCDEFGHIKLMNOPQRSTUVWXY"]  # A-I, K-Y (no J/Z)
DEFAULT_MODEL = os.path.join(os.path.dirname(__file__), "models", "hand_landmarker.task")
DEFAULT_OUT = os.path.join(os.path.dirname(__file__), "data", "static_landmarks.csv")
IMG_EXTS = (".jpg", ".jpeg", ".png", ".bmp")


def build_landmarker(model_path):
    import mediapipe as mp
    from mediapipe.tasks.python import BaseOptions
    from mediapipe.tasks.python.vision import HandLandmarker, HandLandmarkerOptions
    from mediapipe.tasks.python.vision.core.vision_task_running_mode import (
        VisionTaskRunningMode,
    )

    return HandLandmarker.create_from_options(
        HandLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=model_path),
            running_mode=VisionTaskRunningMode.IMAGE,
            num_hands=1,
            min_hand_detection_confidence=0.5,
        )
    )


def landmarks_from_image(landmarker, path):
    import mediapipe as mp

    try:
        image = mp.Image.create_from_file(path)
    except Exception:
        return None
    result = landmarker.detect(image)
    if not result.hand_landmarks:
        return None
    return [(lm.x, lm.y, lm.z) for lm in result.hand_landmarks[0]]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--images-dir", required=True, help="dir with one subfolder per letter")
    ap.add_argument("--output", default=DEFAULT_OUT, help="CSV to append rows to")
    ap.add_argument("--limit-per-letter", type=int, default=600,
                    help="max images to sample per letter (default 600)")
    ap.add_argument("--model-path", default=DEFAULT_MODEL)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    random.seed(args.seed)
    landmarker = build_landmarker(args.model_path)

    write_header = not os.path.exists(args.output) or os.path.getsize(args.output) == 0
    os.makedirs(os.path.dirname(args.output), exist_ok=True)

    total_written = 0
    with open(args.output, "a", newline="") as f:
        w = csv.writer(f)
        if write_header:
            w.writerow(landmark_row_header())

        for letter in STATIC_LETTERS:
            folder = os.path.join(args.images_dir, letter)
            if not os.path.isdir(folder):
                print(f"  {letter}: no folder, skipped")
                continue
            files = [
                os.path.join(folder, n)
                for n in os.listdir(folder)
                if n.lower().endswith(IMG_EXTS)
            ]
            random.shuffle(files)
            files = files[: args.limit_per_letter]

            kept = miss = 0
            for path in files:
                lms = landmarks_from_image(landmarker, path)
                if lms is None or len(lms) != 21:
                    miss += 1
                    continue
                w.writerow(landmarks_to_row(letter, lms))
                kept += 1
            total_written += kept
            print(f"  {letter}: {kept} rows written, {miss} images had no detectable hand", flush=True)

    print(f"\nDone. {total_written} landmark rows appended to {args.output}")


if __name__ == "__main__":
    main()
