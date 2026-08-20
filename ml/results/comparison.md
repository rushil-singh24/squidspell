# Static Classifier: Raw vs. Engineered Feature Comparison

| Model | Feature Set | CV Accuracy | Test Accuracy | Precision | Recall | F1 |
|---|---|---|---|---|---|---|
| random_forest | raw | 0.986 | 0.987 | 0.987 | 0.987 | 0.987 |
| svm | raw | 0.819 | 0.849 | 0.842 | 0.849 | 0.833 |
| gradient_boosting | raw | 0.975 | 0.979 | 0.980 | 0.979 | 0.979 |
| logistic_regression | raw | 0.903 | 0.911 | 0.919 | 0.911 | 0.911 |
| random_forest | engineered | 0.994 | 0.994 | 0.994 | 0.994 | 0.994 |
| svm | engineered | 0.941 | 0.941 | 0.942 | 0.941 | 0.941 |
| gradient_boosting | engineered | 0.983 | 0.990 | 0.990 | 0.990 | 0.990 |
| logistic_regression | engineered | 0.979 | 0.978 | 0.979 | 0.978 | 0.978 |
