"""Motion-letter (J/Z) and negative-example data collection: webcam + MediaPipe Hands ->
ml/data/motion_sequences/<label>_<index>.csv + manifest.csv.

Run interactively (needs a real webcam): `python collect_motion.py --letter J`
See run_motion_capture() and save_take() for the hardware-free, testable logic; everything
below the `if __name__ == "__main__":` guard wires it to a real webcam and MediaPipe.
"""
from __future__ import annotations

import argparse
import csv
import os
import re
import time

from collection_utils import flatten_landmarks, landmark_row_header, resample_sequence

MOTION_LABELS = ["J", "Z", "negative"]
DEFAULT_OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "data", "motion_sequences")
DEFAULT_MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "hand_landmarker.task")
MANIFEST_COLUMNS = ["label", "source", "filepath", "num_raw_frames", "captured_at"]


def run_motion_capture(window_seconds, frame_source, hand_processor, clock_fn):
    """Record raw landmark frames for window_seconds, dropping frames with no detected hand.

    frame_source: an iterable/iterator yielding raw frames (opaque to this function).
    hand_processor: callable(frame) -> landmarks | None (a list of 21 (x, y, z) tuples, or
      None if no hand was detected in that frame).
    clock_fn: callable() -> float, monotonic seconds (injected so tests don't need real time).
    Returns: list of frames (each a list of 21 (x, y, z) tuples) — the raw, un-resampled take.
    """
    start = clock_fn()
    raw_frames = []
    for frame in frame_source:
        if clock_fn() - start >= window_seconds:
            break
        landmarks = hand_processor(frame)
        if landmarks is not None:
            raw_frames.append(landmarks)
    return raw_frames


def save_take(label, source, resampled_frames, num_raw_frames, output_dir, index, captured_at):
    """Write one resampled take to its own CSV file and append a manifest row.

    resampled_frames: list of target_len frames, each a list of 21 (x, y, z) tuples —
      one row per frame in the output file, columns matching landmark_row_header()[1:]
      (no label column in the per-take file; label lives in the manifest).
    num_raw_frames: the actual number of raw captured frames before resampling (recorded in
      the manifest so it reflects reality rather than the fixed resample length).
    Returns: the filename written (relative to output_dir).
    """
    os.makedirs(output_dir, exist_ok=True)
    filename = f"{label}_{index:03d}.csv"
    filepath = os.path.join(output_dir, filename)

    header = landmark_row_header()[1:]  # drop "label" — this file is single-take, single-label
    with open(filepath, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(header)
        for frame in resampled_frames:
            writer.writerow(flatten_landmarks(frame))

    manifest_path = os.path.join(output_dir, "manifest.csv")
    manifest_exists = os.path.exists(manifest_path)
    with open(manifest_path, "a", newline="") as f:
        writer = csv.writer(f)
        if not manifest_exists:
            writer.writerow(MANIFEST_COLUMNS)
        writer.writerow([label, source, filename, num_raw_frames, captured_at])

    return filename


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
        if not result.hand_landmarks:
            return None
        return [(lm.x, lm.y, lm.z) for lm in result.hand_landmarks[0]]
    return process


def _next_index(output_dir, label):
    """Find the next unused index for label_NNN.csv in output_dir.

    Uses max(existing numeric suffixes) + 1 rather than a count of existing files, so
    deleting a take (e.g. to discard a bad one) doesn't cause the next recording to reuse
    — and silently overwrite — a still-existing take's filename.
    """
    if not os.path.isdir(output_dir):
        return 0
    pattern = re.compile(rf"^{re.escape(label)}_(\d+)\.csv$")
    indices = []
    for f in os.listdir(output_dir):
        match = pattern.match(f)
        if match:
            indices.append(int(match.group(1)))
    return max(indices) + 1 if indices else 0


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
    window_name = "SquidSpell motion capture (press ESC to stop early)"

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
        print("Countdown aborted (ESC pressed). No take recorded.")
    else:
        print(f"Recording for {args.window_seconds}s. Perform the motion now.")

        def frame_source():
            while True:
                ok, frame = cap.read()
                if not ok:
                    break
                cv2.imshow(window_name, frame)
                if cv2.waitKey(1) & 0xFF == 27:
                    break
                yield frame

        raw_frames = run_motion_capture(args.window_seconds, frame_source(), processor, time.monotonic)
        if len(raw_frames) < 2:
            print(f"Only captured {len(raw_frames)} frame(s) with a detected hand — need at least 2. "
                  f"Take discarded, try again.")
        else:
            resampled = resample_sequence(raw_frames, args.resample_len)
            index = _next_index(args.output_dir, args.letter)
            filename = save_take(args.letter, args.letter, resampled, len(raw_frames), args.output_dir,
                                  index, time.time())
            print(f"Saved take '{filename}' ({len(raw_frames)} raw frames -> {args.resample_len} resampled) "
                  f"to {args.output_dir}")

    cap.release()
    cv2.destroyAllWindows()
    hands.close()


def main():
    parser = argparse.ArgumentParser(description="Collect a J/Z motion take or a negative example.")
    parser.add_argument("--letter", required=True, choices=MOTION_LABELS, help="J, Z, or negative")
    parser.add_argument("--window-seconds", type=float, default=1.3, help="Recording window in seconds (default 1.3)")
    parser.add_argument("--resample-len", type=int, default=20, help="Fixed sequence length after resampling (default 20)")
    parser.add_argument("--countdown", type=int, default=3, help="Countdown seconds before recording (default 3)")
    parser.add_argument("--output-dir", default=DEFAULT_OUTPUT_DIR, help="Directory to write takes + manifest.csv into")
    parser.add_argument("--model-path", default=DEFAULT_MODEL_PATH, help="Path to hand_landmarker.task")
    args = parser.parse_args()
    _run_interactive(args)


if __name__ == "__main__":
    main()
