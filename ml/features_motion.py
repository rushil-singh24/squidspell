"""Trajectory-level feature extraction for resampled motion sequences
(J / Z / negative). Pure, hardware-free — see docs/superpowers/plans/
2026-08-19-phase-2-model-training.md, Task 2, for the exact feature layout.

Note: `path_length`, `curvature`, and `direction_reversals` scale with how
many frames are passed in and over what wall-clock span they were captured,
so callers must resample their input to the same frame count (20) used at
training time via `collection_utils.resample_sequence(frames, target_len=20)`
before calling `extract_motion_features()` — do not feed a fixed-time
rolling buffer of a different length.
"""
from __future__ import annotations

import math

from features_static import extract_static_features

EPSILON = 1e-9


def _centroid(frame):
    n = len(frame)
    xs, ys, zs = zip(*frame)
    return (sum(xs) / n, sum(ys) / n, sum(zs) / n)


def _dist(p, q):
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(p, q)))


def _sub(p, q):
    return tuple(a - b for a, b in zip(p, q))


def extract_motion_features(frames):
    centroids = [_centroid(f) for f in frames]

    dx, dy, dz = _sub(centroids[-1], centroids[0])
    magnitude = math.sqrt(dx * dx + dy * dy + dz * dz)

    path_length = sum(_dist(centroids[i], centroids[i + 1]) for i in range(len(centroids) - 1))
    curvature = path_length / (magnitude + EPSILON)

    displacements = [_sub(centroids[i + 1], centroids[i]) for i in range(len(centroids) - 1)]
    reversals = sum(
        1 for i in range(len(displacements) - 1)
        if sum(a * b for a, b in zip(displacements[i], displacements[i + 1])) < 0
    )

    xs = [c[0] for c in centroids]
    ys = [c[1] for c in centroids]
    zs = [c[2] for c in centroids]
    width = max(xs) - min(xs)
    height = max(ys) - min(ys)
    depth = max(zs) - min(zs)

    starting_handshape = extract_static_features(frames[0])

    return [float(v) for v in (
        dx, dy, dz, magnitude, path_length, curvature, reversals,
        width / (height + EPSILON), width / (depth + EPSILON),
        *starting_handshape,
    )]
