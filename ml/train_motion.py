"""Motion-letter (J / Z / negative) classifier training: loads
ml/data/motion_sequences/manifest.csv + per-take files, trains and exports
the better of Random Forest / SVM. See docs/superpowers/plans/
2026-08-19-phase-2-model-training.md, Task 4. Run for real: `python train_motion.py`.
"""
from __future__ import annotations

import argparse
import os

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.svm import SVC

from features_motion import extract_motion_features

DEFAULT_DATA_DIR = os.path.join(os.path.dirname(__file__), "data", "motion_sequences")
DEFAULT_MANIFEST_PATH = os.path.join(DEFAULT_DATA_DIR, "manifest.csv")
DEFAULT_MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "motion_model.pkl")
DEFAULT_REPORT_PATH = os.path.join(os.path.dirname(__file__), "results", "motion_comparison.md")


def load_motion_dataset(manifest_path):
    data_dir = os.path.dirname(manifest_path)
    manifest = pd.read_csv(manifest_path)
    X, y = [], []
    for _, row in manifest.iterrows():
        take_df = pd.read_csv(os.path.join(data_dir, row["filepath"]))
        frames = [
            [tuple(take_row[i:i + 3]) for i in range(0, len(take_row), 3)]
            for take_row in take_df.values.tolist()
        ]
        X.append(extract_motion_features(frames))
        y.append(row["label"])
    return X, y


def build_candidate_models():
    return {
        "random_forest": RandomForestClassifier(n_estimators=200, random_state=42),
        "svm": SVC(kernel="rbf", C=1.0, random_state=42),
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
    per_class_recall = {
        label: metrics["recall"] for label, metrics in report.items()
        if label not in ("accuracy", "macro avg", "weighted avg")
    }

    return {
        "cv_accuracy_mean": float(cv_scores.mean()),
        "test_accuracy": float(report["accuracy"]),
        "precision": float(weighted["precision"]),
        "recall": float(weighted["recall"]),
        "f1": float(weighted["f1-score"]),
        "confusion_matrix": confusion_matrix(y_test, predictions).tolist(),
        "per_class_recall": per_class_recall,
    }


def write_motion_report(results, path):
    report_dir = os.path.dirname(path)
    if report_dir:
        os.makedirs(report_dir, exist_ok=True)
    lines = [
        "# Motion Classifier (J / Z / negative) Comparison\n",
        "| Model | CV Accuracy | Test Accuracy | Precision | Recall | F1 |",
        "|---|---|---|---|---|---|",
    ]
    for r in results:
        lines.append(
            f"| {r['model']} | {r['cv_accuracy_mean']:.3f} | {r['test_accuracy']:.3f} | "
            f"{r['precision']:.3f} | {r['recall']:.3f} | {r['f1']:.3f} |"
        )
    lines.append("\n## Per-class recall (negative-class recall is the key anti-false-trigger metric)\n")
    lines.append("| Model | J recall | Z recall | negative recall |")
    lines.append("|---|---|---|---|")
    for r in results:
        pcr = r["per_class_recall"]
        lines.append(f"| {r['model']} | {pcr.get('J', 0):.3f} | {pcr.get('Z', 0):.3f} | {pcr.get('negative', 0):.3f} |")

    negative_recalls = {r["model"]: r["per_class_recall"].get("negative", 0.0) for r in results}
    best_negative_model = max(negative_recalls, key=negative_recalls.get)
    lines.append("\n## Negative-class recall (anti-false-trigger)\n")
    lines.append(
        "The `negative` class recall measures how reliably the classifier avoids "
        "firing a J/Z detection on non-J/Z motion (the key anti-false-trigger metric)."
    )
    for r in results:
        lines.append(f"- **{r['model']}**: negative recall = {r['per_class_recall'].get('negative', 0.0):.3f}")
    lines.append(
        f"\nBest negative-class recall: **{best_negative_model}** "
        f"({negative_recalls[best_negative_model]:.3f})."
    )

    with open(path, "w") as f:
        f.write("\n".join(lines) + "\n")


def train_and_export(manifest_path, model_out_path, report_out_path):
    X, y = load_motion_dataset(manifest_path)

    results = []
    for model_name, model in build_candidate_models().items():
        metrics = evaluate_model(model, X, y)
        results.append({"model": model_name, **metrics})

    best = max(results, key=lambda r: r["cv_accuracy_mean"])
    final_model = build_candidate_models()[best["model"]]
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=42
    )
    final_model.fit(X_train, y_train)

    write_motion_report(results, report_out_path)

    classes = sorted(set(y))
    model_dir = os.path.dirname(model_out_path)
    if model_dir:
        os.makedirs(model_dir, exist_ok=True)
    joblib.dump({"model": final_model, "classes": classes}, model_out_path)

    best_result = next(r for r in results if r["model"] == best["model"])
    return {
        "model_name": best["model"],
        "test_accuracy": best_result["test_accuracy"],
        "negative_recall": best_result["per_class_recall"].get("negative", 0.0),
    }


def main():
    parser = argparse.ArgumentParser(description="Train the motion (J/Z/negative) classifier.")
    parser.add_argument("--manifest-path", default=DEFAULT_MANIFEST_PATH)
    parser.add_argument("--model-out", default=DEFAULT_MODEL_PATH)
    parser.add_argument("--report-out", default=DEFAULT_REPORT_PATH)
    args = parser.parse_args()
    summary = train_and_export(args.manifest_path, args.model_out, args.report_out)
    print(f"Winner: {summary['model_name']}, test accuracy {summary['test_accuracy']:.3f}, "
          f"negative-class recall {summary['negative_recall']:.3f}")


if __name__ == "__main__":
    main()
