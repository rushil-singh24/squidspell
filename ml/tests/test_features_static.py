import math

import pytest

from features_static import extract_static_features


def _flat_hand():
    """A synthetic hand: wrist at origin, all 5 fingers straight and splayed
    along the xy-plane at different angles, all the same length. Lets us
    assert exact extension (1.0) and exact fingertip-distance/angle values."""
    landmarks = [(0.0, 0.0, 0.0)] * 21
    landmarks[0] = (0.0, 0.0, 0.0)  # wrist
    # middle finger straight up the y-axis: MCP(9), PIP(10), DIP(11), TIP(12)
    landmarks[9] = (0.0, 1.0, 0.0)
    landmarks[10] = (0.0, 2.0, 0.0)
    landmarks[11] = (0.0, 3.0, 0.0)
    landmarks[12] = (0.0, 4.0, 0.0)
    # index finger straight, angled 90 degrees away on the x-axis
    landmarks[5] = (1.0, 0.0, 0.0)
    landmarks[6] = (2.0, 0.0, 0.0)
    landmarks[7] = (3.0, 0.0, 0.0)
    landmarks[8] = (4.0, 0.0, 0.0)
    # thumb, ring, pinky: give them non-degenerate (bent) shapes so
    # normalization's reference distance (wrist->9) and extension both work
    landmarks[1], landmarks[2], landmarks[3], landmarks[4] = (
        (0.5, 0.0, 0.0), (1.0, 0.3, 0.0), (1.3, 0.3, 0.0), (1.3, 0.6, 0.0),
    )
    landmarks[13], landmarks[14], landmarks[15], landmarks[16] = (
        (-1.0, 0.0, 0.0), (-2.0, 0.0, 0.0), (-2.0, 1.0, 0.0), (-2.0, 2.0, 0.0),
    )
    landmarks[17], landmarks[18], landmarks[19], landmarks[20] = (
        (-0.5, 0.0, 0.0), (-1.0, 0.0, 0.0), (-1.0, 0.5, 0.0), (-1.0, 1.0, 0.0),
    )
    return landmarks


def test_extract_static_features_returns_40_floats():
    features = extract_static_features(_flat_hand())
    assert len(features) == 40
    assert all(isinstance(f, float) for f in features)


def test_middle_finger_fully_extended_has_extension_near_one():
    features = extract_static_features(_flat_hand())
    # extension values are features[20:25] in thumb,index,middle,ring,pinky
    # order (FINGERS dict order) -> middle is global index 22
    middle_extension = features[22]
    assert middle_extension == pytest.approx(1.0, abs=1e-6)


def test_middle_index_fingertip_distance_is_normalized_scale():
    features = extract_static_features(_flat_hand())
    # middle(12)-index(8) is the 5th pairwise distance (0-indexed 4) in
    # combinations([4,8,12,16,20], 2) order: (4,8),(4,12),(4,16),(4,20),(8,12),...
    dist_8_12 = features[4]
    # raw distance between (4,0,0) and (0,4,0) is sqrt(32); normalization
    # divides by dist(wrist, landmark 9) = 1.0, so it's unchanged here
    assert dist_8_12 == pytest.approx(math.sqrt(32), rel=1e-4)


def test_straight_finger_joint_angles_are_near_pi():
    features = extract_static_features(_flat_hand())
    # joint angles are features[10:20], 2 per finger in thumb,index,middle,
    # ring,pinky order -> middle's pair is global indices [14, 15]
    middle_angle_1, middle_angle_2 = features[14], features[15]
    assert middle_angle_1 == pytest.approx(math.pi, abs=1e-6)
    assert middle_angle_2 == pytest.approx(math.pi, abs=1e-6)


def test_bent_finger_has_extension_below_one():
    landmarks = _flat_hand()
    # bend the middle finger's DIP joint (11) off to the side instead of
    # straight up, without changing MCP/PIP/TIP
    landmarks[11] = (1.0, 3.0, 0.0)
    features = extract_static_features(landmarks)
    middle_extension = features[22]  # see test above for index derivation
    assert middle_extension < 0.99
