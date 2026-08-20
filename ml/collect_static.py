"""Static-letter data collection: webcam + MediaPipe Hands -> ml/data/static_landmarks.csv.

Run interactively (needs a real webcam): `python collect_static.py --letter A`
See run_static_collection() for the hardware-free, testable capture loop; everything
below the `if __name__ == "__main__":` guard wires it to a real webcam and MediaPipe.
"""
from __future__ import annotations

import argparse
import csv
import os

from collection_utils import is_confident, landmark_row_header, landmarks_to_row

STATIC_LETTERS = [c for c in "ABCDEFGHIKLMNOPQRSTUVWXY"]  # excludes J and Z (motion letters)
DEFAULT_CSV_PATH = os.path.join(os.path.dirname(__file__), "data", "static_landmarks.csv")
DEFAULT_MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "hand_landmarker.task")


def run_static_collection(letter, num_frames, confidence_threshold, frame_source,
                           hand_processor, on_progress=None):
    """Capture up to `num_frames` confidently-detected labeled frames for `letter`.

    frame_source: an iterable/iterator yielding raw frames (opaque to this function).
    hand_processor: callable(frame) -> (landmarks, handedness_score), where landmarks is
      a list of 21 (x, y, z) tuples or None if no hand was detected.
    on_progress: optional callable(rows_collected, num_frames) invoked after each confident frame.
    Returns: list of CSV rows (each a list starting with `letter`).
    """
    if letter not in STATIC_LETTERS:
        raise ValueError(f"{letter!r} is not one of the 24 static letters: {STATIC_LETTERS}")

    rows = []
    for frame in frame_source:
        if len(rows) >= num_frames:
            break
        landmarks, score = hand_processor(frame)
        if landmarks is not None and is_confident(score, confidence_threshold):
            rows.append(landmarks_to_row(letter, landmarks))
            if on_progress is not None:
                on_progress(len(rows), num_frames)
    return rows


def append_rows_to_csv(rows, csv_path):
    """Append rows to csv_path, writing the header first if the file doesn't exist yet."""
    file_exists = os.path.exists(csv_path)
    if os.path.dirname(csv_path):
        os.makedirs(os.path.dirname(csv_path), exist_ok=True)
    with open(csv_path, "a", newline="") as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow(landmark_row_header())
        writer.writerows(rows)


def _mediapipe_hand_processor(landmarker):
    """Adapt a mediapipe.tasks.python.vision.HandLandmarker (VIDEO mode) to the
    hand_processor(frame) contract."""
    def process(frame):
        import time

        import cv2
        import mediapipe as mp

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = landmarker.detect_for_video(mp_image, int(time.time() * 1000))
        if not result.hand_landmarks or not result.handedness:
            return None, None
        landmarks = [(lm.x, lm.y, lm.z) for lm in result.hand_landmarks[0]]
        score = result.handedness[0][0].score
        return landmarks, score
    return process


def _run_interactive(args):
    import cv2
    from mediapipe.tasks.python import BaseOptions
    from mediapipe.tasks.python.vision import HandLandmarker, HandLandmarkerOptions
    from mediapipe.tasks.python.vision.core.vision_task_running_mode import VisionTaskRunningMode

    cap = cv2.VideoCapture(0)
    hands = HandLandmarker.create_from_options(HandLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=args.model_path),
        running_mode=VisionTaskRunningMode.VIDEO,
        num_hands=1, min_hand_detection_confidence=0.7, min_tracking_confidence=0.5,
    ))
    processor = _mediapipe_hand_processor(hands)
    window_name = "SquidSpell data collection (press ESC to stop early)"

    print(f"Get ready to sign '{args.letter}'. Starting in {args.countdown}s...")
    aborted = False
    for remaining in range(args.countdown, 0, -1):
        print(remaining)
        # Live preview during the countdown so the user can frame themselves in the shot
        # before recording starts, instead of staring at a blank window.
        ok, frame = cap.read()
        if ok:
            cv2.putText(frame, str(remaining), (20, 60), cv2.FONT_HERSHEY_SIMPLEX, 2.0,
                        (0, 0, 255), 3, cv2.LINE_AA)
            cv2.imshow(window_name, frame)
        if cv2.waitKey(1000) & 0xFF == 27:
            aborted = True
            break

    if aborted:
        print("Countdown aborted (ESC pressed). No frames recorded.")
    else:
        print(f"Recording {args.num_frames} frames for '{args.letter}'. Hold the pose.")

        def frame_source():
            while True:
                ok, frame = cap.read()
                if not ok:
                    break
                cv2.imshow(window_name, frame)
                if cv2.waitKey(1) & 0xFF == 27:
                    break
                yield frame

        def on_progress(collected, total):
            if collected % 20 == 0 or collected == total:
                print(f"  {collected}/{total}")

        rows = run_static_collection(args.letter, args.num_frames, args.confidence_threshold,
                                      frame_source(), processor, on_progress)
        append_rows_to_csv(rows, args.output)
        print(f"Saved {len(rows)} rows for '{args.letter}' to {args.output}")

    cap.release()
    cv2.destroyAllWindows()
    hands.close()


def main():
    parser = argparse.ArgumentParser(description="Collect labeled static-letter hand landmarks.")
    parser.add_argument("--letter", required=True, choices=STATIC_LETTERS, help="Target letter (A-I, K-Y)")
    parser.add_argument("--num-frames", type=int, default=200, help="Confident frames to record (default 200)")
    parser.add_argument("--countdown", type=int, default=3, help="Countdown seconds before recording (default 3)")
    parser.add_argument("--confidence-threshold", type=float, default=0.7,
                         help="Min handedness score to keep a frame (default 0.7)")
    parser.add_argument("--output", default=DEFAULT_CSV_PATH, help="CSV path to append to")
    parser.add_argument("--model-path", default=DEFAULT_MODEL_PATH, help="Path to hand_landmarker.task")
    args = parser.parse_args()
    _run_interactive(args)


if __name__ == "__main__":
    main()
