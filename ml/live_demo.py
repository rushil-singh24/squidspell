"""Phase 3 — standalone real-time inference demo.

webcam -> MediaPipe HandLandmarker (VIDEO mode) -> InferenceEngine -> OpenCV overlay.
No backend, no frontend: this is the proof that the static + motion merge works
live before Phase 4 relocates the same logic behind a WebSocket.

Needs a real webcam and the trained models present locally:
    ml/models/static_model.pkl   (python train_static.py)
    ml/models/motion_model.pkl   (python train_motion.py)
    ml/models/hand_landmarker.task

Run: `python live_demo.py`   (press ESC to quit)

The interactive loop below is hardware-bound and not unit-tested — same
convention as collect_static.py / collect_motion.py's _run_interactive.
The testable logic lives in ml/inference.py.
"""
from __future__ import annotations

import argparse
import os
import time

from inference import InferenceEngine
from model_loader import load_motion_model, load_static_model

DEFAULT_STATIC_MODEL = os.path.join(os.path.dirname(__file__), "models", "static_model.pkl")
DEFAULT_MOTION_MODEL = os.path.join(os.path.dirname(__file__), "models", "motion_model.pkl")
DEFAULT_LANDMARKER = os.path.join(os.path.dirname(__file__), "models", "hand_landmarker.task")


def _mediapipe_hand_processor(landmarker):
    """Adapt a mediapipe HandLandmarker (VIDEO mode) to frame -> landmarks | None.
    Same shape as collect_motion.py's helper."""
    def process(frame):
        import cv2
        import mediapipe as mp

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = landmarker.detect_for_video(mp_image, int(time.time() * 1000))
        if not result.hand_landmarks:
            return None
        return [(lm.x, lm.y, lm.z) for lm in result.hand_landmarks[0]]

    return process


def _run_interactive(args):
    import cv2
    from mediapipe.tasks.python import BaseOptions
    from mediapipe.tasks.python.vision import HandLandmarker, HandLandmarkerOptions
    from mediapipe.tasks.python.vision.core.vision_task_running_mode import VisionTaskRunningMode

    static_predictor = load_static_model(args.static_model)
    motion_predictor = load_motion_model(args.motion_model)
    engine = InferenceEngine(static_predictor, motion_predictor)

    cap = cv2.VideoCapture(args.camera_index)
    landmarker = HandLandmarker.create_from_options(HandLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=args.landmarker_path),
        running_mode=VisionTaskRunningMode.VIDEO,
        num_hands=1, min_hand_detection_confidence=0.7, min_tracking_confidence=0.5,
    ))
    processor = _mediapipe_hand_processor(landmarker)
    window = "SquidSpell live demo (ESC to quit)"

    committed = []
    print("Live demo running. Sign letters at the webcam; committed letters print here.")
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            landmarks = processor(frame)
            now_ms = time.monotonic() * 1000.0
            result = engine.process_frame(landmarks, now_ms)

            if result.committed_letter:
                committed.append(result.committed_letter)
                print(f"  committed: {result.committed_letter}  ({result.committed_source})")

            label = result.static_label or "-"
            conf = result.static_confidence
            status = "MOTION…" if result.motion_active else f"{label} {conf:.2f}"
            cv2.putText(frame, status, (20, 50), cv2.FONT_HERSHEY_SIMPLEX, 1.2,
                        (0, 255, 0), 2, cv2.LINE_AA)
            cv2.putText(frame, "".join(committed[-40:]), (20, frame.shape[0] - 25),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 2, cv2.LINE_AA)
            cv2.imshow(window, frame)
            if cv2.waitKey(1) & 0xFF == 27:
                break
    finally:
        cap.release()
        cv2.destroyAllWindows()
        landmarker.close()


def main():
    parser = argparse.ArgumentParser(description="SquidSpell Phase 3 standalone live inference demo.")
    parser.add_argument("--static-model", default=DEFAULT_STATIC_MODEL)
    parser.add_argument("--motion-model", default=DEFAULT_MOTION_MODEL)
    parser.add_argument("--landmarker-path", default=DEFAULT_LANDMARKER)
    parser.add_argument("--camera-index", type=int, default=0)
    args = parser.parse_args()
    _run_interactive(args)


if __name__ == "__main__":
    main()
