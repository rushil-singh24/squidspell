# Motion Classifier (J / Z / negative) Comparison

| Model | CV Accuracy | Test Accuracy | Precision | Recall | F1 |
|---|---|---|---|---|---|
| random_forest | 0.935 | 0.893 | 0.896 | 0.893 | 0.893 |
| svm | 0.862 | 0.821 | 0.823 | 0.821 | 0.816 |

## Per-class recall (negative-class recall is the key anti-false-trigger metric)

| Model | J recall | Z recall | negative recall |
|---|---|---|---|
| random_forest | 0.889 | 1.000 | 0.778 |
| svm | 0.778 | 1.000 | 0.667 |

## Negative-class recall (anti-false-trigger)

The `negative` class recall measures how reliably the classifier avoids firing a J/Z detection on non-J/Z motion (the key anti-false-trigger metric).
- **random_forest**: negative recall = 0.778
- **svm**: negative recall = 0.667

Best negative-class recall: **random_forest** (0.778).
