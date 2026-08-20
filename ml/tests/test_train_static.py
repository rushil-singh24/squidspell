import csv
import os

import joblib
import pytest

from train_static import (
    build_candidate_models,
    evaluate_model,
    load_static_dataset,
    train_and_export,
    write_comparison_report,
)


@pytest.fixture
def tiny_csv(tmp_path):
    """8 samples per letter across 3 letters — enough for a stratified
    train/test split and 3-fold CV without real hand-tracked data."""
    path = tmp_path / "static_landmarks.csv"
    header = ["label"] + [f"{axis}{i}" for i in range(21) for axis in ("x", "y", "z")]
    with open(path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(header)
        for letter_seed, letter in enumerate(["A", "B", "C"]):
            for sample in range(8):
                jitter = sample * 0.001
                row = [letter] + [letter_seed + i * 0.05 + jitter for i in range(63)]
                writer.writerow(row)
    return str(path)


def test_load_static_dataset_shapes(tiny_csv):
    raw_X, engineered_X, y = load_static_dataset(tiny_csv)
    assert len(raw_X) == len(engineered_X) == len(y) == 24
    assert len(raw_X[0]) == 63
    assert len(engineered_X[0]) == 40
    assert set(y) == {"A", "B", "C"}


def test_build_candidate_models_has_four_named_models():
    models = build_candidate_models()
    assert set(models.keys()) == {
        "random_forest", "svm", "gradient_boosting", "logistic_regression",
    }


def test_evaluate_model_returns_expected_keys(tiny_csv):
    raw_X, _, y = load_static_dataset(tiny_csv)
    model = build_candidate_models()["random_forest"]
    result = evaluate_model(model, raw_X, y, cv_folds=3)
    for key in ("cv_accuracy_mean", "test_accuracy", "precision", "recall", "f1", "confusion_matrix"):
        assert key in result
    assert 0.0 <= result["test_accuracy"] <= 1.0


def test_write_comparison_report_creates_markdown_table(tmp_path):
    results = [{
        "model": "random_forest", "feature_set": "raw", "cv_accuracy_mean": 0.9,
        "test_accuracy": 0.95, "precision": 0.94, "recall": 0.95, "f1": 0.94,
        "confusion_matrix": [[3, 0], [0, 3]],
    }]
    out_path = tmp_path / "comparison.md"
    write_comparison_report(results, str(out_path))
    content = out_path.read_text()
    assert "random_forest" in content
    assert "0.95" in content


def test_train_and_export_produces_loadable_model(tiny_csv, tmp_path):
    model_path = tmp_path / "static_model.pkl"
    report_path = tmp_path / "comparison.md"
    summary = train_and_export(tiny_csv, str(model_path), str(report_path))

    assert os.path.exists(model_path)
    assert os.path.exists(report_path)
    assert summary["feature_set"] in ("raw", "engineered")
    assert isinstance(summary["best_params"], dict)

    bundle = joblib.load(model_path)
    assert set(bundle.keys()) == {"model", "feature_set", "classes"}
    assert set(bundle["classes"]) == {"A", "B", "C"}
