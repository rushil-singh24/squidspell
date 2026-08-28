# Motion Classifier (J / Z / negative) Comparison

| Model | CV Accuracy | Test Accuracy | Precision | Recall | F1 |
|---|---|---|---|---|---|
| random_forest | 0.935 | 0.893 | 0.896 | 0.893 | 0.893 |
| svm | 0.862 | 0.821 | 0.823 | 0.821 | 0.816 |

## Per-class precision/recall/F1 (negative-class recall is the key anti-false-trigger metric)

| Model | Class | Precision | Recall | F1 |
|---|---|---|---|---|
| random_forest | J | 0.800 | 0.889 | 0.842 |
| random_forest | Z | 1.000 | 1.000 | 1.000 |
| random_forest | negative | 0.875 | 0.778 | 0.824 |
| svm | J | 0.778 | 0.778 | 0.778 |
| svm | Z | 0.833 | 1.000 | 0.909 |
| svm | negative | 0.857 | 0.667 | 0.750 |

## Negative-class recall (anti-false-trigger)

The `negative` class recall measures how reliably the classifier avoids firing a J/Z detection on non-J/Z motion (the key anti-false-trigger metric).
- **random_forest**: negative recall = 0.778
- **svm**: negative recall = 0.667

Best negative-class recall: **random_forest** (0.778).

## Confusion matrix — winning model (random_forest)

| actual \ predicted | J | Z | negative |
|---|---|---|---|
| J | 8 | 0 | 1 |
| Z | 0 | 10 | 0 |
| negative | 2 | 0 | 7 |
