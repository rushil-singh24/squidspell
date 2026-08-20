"""Static-letter (24-class) classifier training: loads ml/data/static_landmarks.csv,
compares raw-coordinate vs. engineered features across 4 model types, tunes and
exports the winner. See docs/superpowers/plans/2026-08-19-phase-2-model-training.md,
Task 3, for the exact pipeline. Run for real: `python train_static.py`.
"""
from __future__ import annotations

import argparse
import json
import os

import joblib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import ConfusionMatrixDisplay, classification_report, confusion_matrix
from sklearn.model_selection import GridSearchCV, StratifiedKFold, cross_val_score, train_test_split
from sklearn.svm import SVC

from features_static import extract_static_features

DEFAULT_CSV_PATH = os.path.join(os.path.dirname(__file__), "data", "static_landmarks.csv")
DEFAULT_MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "static_model.pkl")
DEFAULT_REPORT_PATH = os.path.join(os.path.dirname(__file__), "results", "comparison.md")
DEFAULT_CONFUSION_MATRIX_PATH = os.path.join(os.path.dirname(__file__), "results", "static_confusion_matrix.png")
DEFAULT_METRICS_JSON_PATH = os.path.join(os.path.dirname(__file__), "results", "metrics.json")

TUNING_GRIDS = {
    "random_forest": {"n_estimators": [100, 300], "max_depth": [None, 10, 20]},
    "svm": {"C": [0.1, 1, 10], "kernel": ["rbf", "linear"]},
    "gradient_boosting": {"n_estimators": [100, 200], "learning_rate": [0.05, 0.1]},
    "logistic_regression": {"C": [0.1, 1, 10]},
}


def load_static_dataset(csv_path):
    df = pd.read_csv(csv_path)
    landmark_cols = [c for c in df.columns if c != "label"]
    raw_X, engineered_X, y = [], [], []
    for _, row in df.iterrows():
        flat = [row[c] for c in landmark_cols]
        landmarks = [tuple(flat[i:i + 3]) for i in range(0, len(flat), 3)]
        raw_X.append(flat)
        engineered_X.append(extract_static_features(landmarks))
        y.append(row["label"])
    return raw_X, engineered_X, y


def build_candidate_models():
    return {
        "random_forest": RandomForestClassifier(n_estimators=200, random_state=42),
        "svm": SVC(kernel="rbf", C=1.0, random_state=42),
        "gradient_boosting": GradientBoostingClassifier(n_estimators=150, random_state=42),
        "logistic_regression": LogisticRegression(max_iter=2000, random_state=42),
    }


def evaluate_model(model, X, y, cv_folds=5):
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=42
    )
    cv = StratifiedKFold(n_splits=cv_folds, shuffle=True, random_state=42)
    cv_scores = cross_val_score(model, X_train, y_train, cv=cv)

    model.fit(X_train, y_train)
    predictions = model.predict(X_test)
    report = classification_report(y_test, predictions, output_dict=True, zero_division=0)
    weighted = report["weighted avg"]

    return {
        "cv_accuracy_mean": float(cv_scores.mean()),
        "test_accuracy": float(report["accuracy"]),
        "precision": float(weighted["precision"]),
        "recall": float(weighted["recall"]),
        "f1": float(weighted["f1-score"]),
        "confusion_matrix": confusion_matrix(y_test, predictions).tolist(),
    }


def _confusion_matrix_markdown(matrix, labels):
    header = "| actual \\ predicted | " + " | ".join(labels) + " |"
    separator = "|---|" + "|".join(["---"] * len(labels)) + "|"
    rows = [header, separator]
    for label, row in zip(labels, matrix):
        rows.append(f"| {label} | " + " | ".join(str(v) for v in row) + " |")
    return "\n".join(rows)


def write_comparison_report(results, path):
    report_dir = os.path.dirname(path)
    if report_dir:
        os.makedirs(report_dir, exist_ok=True)
    lines = [
        "# Static Classifier: Raw vs. Engineered Feature Comparison\n",
        "| Model | Feature Set | CV Accuracy | Test Accuracy | Precision | Recall | F1 |",
        "|---|---|---|---|---|---|---|",
    ]
    for r in results:
        lines.append(
            f"| {r['model']} | {r['feature_set']} | {r['cv_accuracy_mean']:.3f} | "
            f"{r['test_accuracy']:.3f} | {r['precision']:.3f} | {r['recall']:.3f} | {r['f1']:.3f} |"
        )
    with open(path, "w") as f:
        f.write("\n".join(lines) + "\n")


def train_and_export(csv_path, model_out_path, report_out_path,
                      confusion_matrix_out_path=None, metrics_json_out_path=None):
    raw_X, engineered_X, y = load_static_dataset(csv_path)
    feature_sets = {"raw": raw_X, "engineered": engineered_X}

    results = []
    for feature_set_name, X in feature_sets.items():
        for model_name, model in build_candidate_models().items():
            metrics = evaluate_model(model, X, y)
            results.append({"model": model_name, "feature_set": feature_set_name, **metrics})

    best = max(results, key=lambda r: r["cv_accuracy_mean"])
    best_X = feature_sets[best["feature_set"]]
    tuned = GridSearchCV(
        build_candidate_models()[best["model"]],
        TUNING_GRIDS[best["model"]],
        cv=3,
    )
    X_train, X_test, y_train, y_test = train_test_split(
        best_X, y, test_size=0.2, stratify=y, random_state=42
    )
    tuned.fit(X_train, y_train)
    final_model = tuned.best_estimator_
    best_params = {k: v for k, v in tuned.best_params_.items()}
    predictions = final_model.predict(X_test)
    final_test_accuracy = float((predictions == pd.Series(y_test).values).mean())

    if confusion_matrix_out_path:
        os.makedirs(os.path.dirname(confusion_matrix_out_path), exist_ok=True)
        ConfusionMatrixDisplay.from_predictions(y_test, predictions)
        plt.savefig(confusion_matrix_out_path, bbox_inches="tight")
        plt.close()

    write_comparison_report(results, report_out_path)

    classes = sorted(set(y))
    tuned_matrix = confusion_matrix(y_test, predictions, labels=classes).tolist()
    with open(report_out_path, "a") as f:
        f.write("\n## Tuned winner\n\n")
        f.write(
            f"After comparing all {len(results)} untuned model/feature-set combinations above, "
            f"`GridSearchCV` tuned the best-by-CV-accuracy combination: **{best['model']}** on "
            f"**{best['feature_set']}** features.\n\n"
        )
        f.write(f"- Best params: `{best_params}`\n")
        f.write(f"- Tuned test accuracy: **{final_test_accuracy:.3f}** "
                f"(untuned test accuracy for this combination: {best['test_accuracy']:.3f})\n\n")
        f.write("### Confusion matrix — tuned winner\n\n")
        f.write(_confusion_matrix_markdown(tuned_matrix, classes))
        f.write("\n")

    if metrics_json_out_path:
        metrics_dir = os.path.dirname(metrics_json_out_path)
        if metrics_dir:
            os.makedirs(metrics_dir, exist_ok=True)
        with open(metrics_json_out_path, "w") as f:
            json.dump(results, f, indent=2)

    model_dir = os.path.dirname(model_out_path)
    if model_dir:
        os.makedirs(model_dir, exist_ok=True)
    joblib.dump(
        {"model": final_model, "feature_set": best["feature_set"], "classes": classes},
        model_out_path,
    )

    return {
        "model_name": best["model"], "feature_set": best["feature_set"],
        "test_accuracy": final_test_accuracy, "best_params": best_params,
    }


def main():
    parser = argparse.ArgumentParser(description="Train the static-letter classifier.")
    parser.add_argument("--csv-path", default=DEFAULT_CSV_PATH)
    parser.add_argument("--model-out", default=DEFAULT_MODEL_PATH)
    parser.add_argument("--report-out", default=DEFAULT_REPORT_PATH)
    args = parser.parse_args()
    summary = train_and_export(
        args.csv_path, args.model_out, args.report_out, DEFAULT_CONFUSION_MATRIX_PATH,
        DEFAULT_METRICS_JSON_PATH,
    )
    print(f"Winner: {summary['model_name']} ({summary['feature_set']} features), "
          f"test accuracy {summary['test_accuracy']:.3f}, best params {summary['best_params']}")


if __name__ == "__main__":
    main()
