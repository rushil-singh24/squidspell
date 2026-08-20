"""Engineered feature extraction for static-letter hand landmarks.

Pure, hardware-free: takes already-loaded 21 (x, y, z) landmark tuples
(e.g. one row of ml/data/static_landmarks.csv) and returns a fixed-order
list of 40 engineered floats. See docs/superpowers/plans/
2026-08-19-phase-2-model-training.md, Task 1, for the exact feature layout
and formula for each of the four feature groups below.
"""
from __future__ import annotations

import itertools
import math

WRIST = 0
FINGERS = {
    "thumb": (1, 2, 3, 4),
    "index": (5, 6, 7, 8),
    "middle": (9, 10, 11, 12),
    "ring": (13, 14, 15, 16),
    "pinky": (17, 18, 19, 20),
}
FINGERTIPS = [4, 8, 12, 16, 20]
EPSILON = 1e-9


def _dist(p, q):
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(p, q)))


def _sub(p, q):
    return tuple(a - b for a, b in zip(p, q))


def _angle(u, v):
    dot = sum(a * b for a, b in zip(u, v))
    norm = math.sqrt(sum(a * a for a in u)) * math.sqrt(sum(a * a for a in v))
    if norm < EPSILON:
        return 0.0
    return math.acos(max(-1.0, min(1.0, dot / norm)))


def _normalize(landmarks):
    wrist = landmarks[WRIST]
    scale = _dist(wrist, landmarks[9]) + EPSILON
    return [tuple((c - w) / scale for c, w in zip(pt, wrist)) for pt in landmarks]


def extract_static_features(landmarks):
    norm = _normalize(landmarks)

    pairwise_distances = [
        _dist(norm[a], norm[b]) for a, b in itertools.combinations(FINGERTIPS, 2)
    ]

    joint_angles = []
    finger_extensions = []
    for a, b, c, d in FINGERS.values():
        joint_angles.append(_angle(_sub(norm[a], norm[b]), _sub(norm[c], norm[b])))
        joint_angles.append(_angle(_sub(norm[b], norm[c]), _sub(norm[d], norm[c])))
        segment_len = _dist(norm[a], norm[b]) + _dist(norm[b], norm[c]) + _dist(norm[c], norm[d])
        finger_extensions.append(_dist(norm[a], norm[d]) / (segment_len + EPSILON))

    fingertip_vectors = []
    for tip in FINGERTIPS:
        fingertip_vectors.extend(norm[tip])

    return [float(v) for v in (*pairwise_distances, *joint_angles, *finger_extensions, *fingertip_vectors)]
