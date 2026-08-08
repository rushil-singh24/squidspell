"""Pure, hardware-free helper functions shared by collect_static.py and collect_motion.py.

Nothing in this module touches cv2, mediapipe, or a webcam — that's deliberate, so all of
it is unit-testable without a camera. See collect_static.py / collect_motion.py for where
these functions plug into the actual capture loops.
"""
from __future__ import annotations

import numpy as np

NUM_LANDMARKS = 21


def flatten_landmarks(landmarks):
    """Flatten a sequence of 21 (x, y, z) tuples into 63 floats: x0,y0,z0,...,x20,y20,z20."""
    if len(landmarks) != NUM_LANDMARKS:
        raise ValueError(f"expected {NUM_LANDMARKS} landmarks, got {len(landmarks)}")
    flat = []
    for x, y, z in landmarks:
        flat.extend([x, y, z])
    return flat


def landmark_row_header():
    """Column headers matching flatten_landmarks' output order, prefixed with 'label'."""
    header = ["label"]
    for i in range(NUM_LANDMARKS):
        header.extend([f"x{i}", f"y{i}", f"z{i}"])
    return header


def landmarks_to_row(label, landmarks):
    """Build one CSV row (list) for a single labeled frame of landmarks."""
    return [label] + flatten_landmarks(landmarks)


def is_confident(handedness_score, threshold=0.7):
    """True if a MediaPipe handedness classification score clears the capture threshold."""
    return handedness_score is not None and handedness_score >= threshold


def resample_sequence(frames, target_len=20):
    """Resample a variable-length sequence of landmark-frames to exactly target_len frames
    via linear interpolation per coordinate, so takes of different durations/frame-rates
    become comparable-length inputs for the motion classifier.

    frames: list of frames, each frame a list of NUM_LANDMARKS (x, y, z) tuples.
    Returns: list of target_len frames in the same (x, y, z)-tuple-list shape.
    """
    n = len(frames)
    if n < 2:
        raise ValueError("need at least 2 frames to resample")
    if target_len < 2:
        raise ValueError("target_len must be at least 2")

    arr = np.array(frames, dtype=float)  # shape (n, 21, 3)
    src_x = np.linspace(0.0, 1.0, num=n)
    dst_x = np.linspace(0.0, 1.0, num=target_len)

    resampled = np.empty((target_len, arr.shape[1], arr.shape[2]), dtype=float)
    for landmark_i in range(arr.shape[1]):
        for coord_i in range(arr.shape[2]):
            resampled[:, landmark_i, coord_i] = np.interp(dst_x, src_x, arr[:, landmark_i, coord_i])

    return [
        [tuple(resampled[frame_i, landmark_i]) for landmark_i in range(arr.shape[1])]
        for frame_i in range(target_len)
    ]
