import pytest

from features_motion import extract_motion_features


def _straight_line_frames(num_frames=20):
    """Hand centroid moves in a straight line along +x, handshape held
    constant (all landmarks at the origin each frame except a fixed offset
    pattern, so extract_static_features doesn't blow up on degenerate input)."""
    base = [(i * 0.01, i * 0.01, 0.0) for i in range(21)]
    frames = []
    for t in range(num_frames):
        offset = t * 0.1
        frames.append([(x + offset, y, z) for x, y, z in base])
    return frames


def _zigzag_frames(num_frames=20):
    """Centroid reverses x-direction every other frame — high reversal count,
    net displacement much smaller than path length."""
    base = [(i * 0.01, i * 0.01, 0.0) for i in range(21)]
    frames = []
    x = 0.0
    for t in range(num_frames):
        x += 0.1 if t % 2 == 0 else -0.1
        frames.append([(px + x, py, pz) for px, py, pz in base])
    return frames


def test_extract_motion_features_returns_49_floats():
    features = extract_motion_features(_straight_line_frames())
    assert len(features) == 49
    assert all(isinstance(f, float) for f in features)


def test_straight_line_has_zero_direction_reversals():
    features = extract_motion_features(_straight_line_frames())
    direction_reversals = features[6]
    assert direction_reversals == pytest.approx(0.0)


def test_zigzag_has_many_direction_reversals():
    features = extract_motion_features(_zigzag_frames())
    direction_reversals = features[6]
    assert direction_reversals > 10


def test_straight_line_curvature_near_one():
    features = extract_motion_features(_straight_line_frames())
    curvature = features[5]
    assert curvature == pytest.approx(1.0, abs=1e-3)


def test_zigzag_path_length_exceeds_net_displacement():
    features = extract_motion_features(_zigzag_frames())
    dx, dy, dz, magnitude = features[0:4]
    path_length = features[4]
    assert path_length > magnitude
