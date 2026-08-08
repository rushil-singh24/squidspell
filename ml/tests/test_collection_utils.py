import pytest

from collection_utils import (
    flatten_landmarks,
    is_confident,
    landmark_row_header,
    landmarks_to_row,
    resample_sequence,
)


def _landmarks(seed=0.0):
    return [(seed + i, seed + i + 0.1, seed + i + 0.2) for i in range(21)]


def test_flatten_landmarks_orders_coordinates_correctly():
    flat = flatten_landmarks(_landmarks(seed=1.0))
    assert flat[0:3] == [1.0, 1.1, 1.2]
    assert flat[3:6] == [2.0, 2.1, 2.2]
    assert len(flat) == 63


def test_flatten_landmarks_wrong_length_raises():
    with pytest.raises(ValueError):
        flatten_landmarks(_landmarks()[:20])


def test_landmark_row_header_matches_flatten_order():
    header = landmark_row_header()
    assert header[0] == "label"
    assert header[1:4] == ["x0", "y0", "z0"]
    assert header[-3:] == ["x20", "y20", "z20"]
    assert len(header) == 64


def test_landmarks_to_row_prepends_label():
    row = landmarks_to_row("A", _landmarks())
    assert row[0] == "A"
    assert len(row) == 64


def test_is_confident_above_threshold():
    assert is_confident(0.9, threshold=0.7) is True


def test_is_confident_below_threshold():
    assert is_confident(0.5, threshold=0.7) is False


def test_is_confident_at_threshold_boundary_is_confident():
    assert is_confident(0.7, threshold=0.7) is True


def test_is_confident_none_score_is_not_confident():
    assert is_confident(None, threshold=0.7) is False


def test_resample_sequence_output_length_matches_target():
    frames = [_landmarks(seed=float(i)) for i in range(5)]
    out = resample_sequence(frames, target_len=20)
    assert len(out) == 20
    assert len(out[0]) == 21
    assert len(out[0][0]) == 3


def test_resample_sequence_preserves_endpoints():
    frames = [_landmarks(seed=0.0), _landmarks(seed=10.0), _landmarks(seed=20.0)]
    out = resample_sequence(frames, target_len=5)
    assert out[0][0][0] == pytest.approx(frames[0][0][0])
    assert out[-1][0][0] == pytest.approx(frames[-1][0][0])


def test_resample_sequence_linear_interpolation_midpoint():
    # x for landmark 0 goes 0.0 -> 1.0 -> 2.0 linearly across 3 evenly-spaced frames;
    # resampling to 3 points should reproduce the same linear values.
    frames = [
        [(0.0, 0.0, 0.0)] * 21,
        [(1.0, 0.0, 0.0)] * 21,
        [(2.0, 0.0, 0.0)] * 21,
    ]
    out = resample_sequence(frames, target_len=3)
    assert out[1][0][0] == pytest.approx(1.0)


def test_resample_sequence_upsamples_short_take():
    frames = [_landmarks(seed=0.0), _landmarks(seed=1.0)]
    out = resample_sequence(frames, target_len=20)
    assert len(out) == 20


def test_resample_sequence_too_few_frames_raises():
    with pytest.raises(ValueError):
        resample_sequence([_landmarks()], target_len=20)


def test_resample_sequence_target_len_too_small_raises():
    with pytest.raises(ValueError):
        resample_sequence([_landmarks(), _landmarks()], target_len=1)
