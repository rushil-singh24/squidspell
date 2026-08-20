import csv
import os

import joblib
import pytest

from train_motion import (
    build_candidate_models,
    evaluate_model,
    load_motion_dataset,
    train_and_export,
    write_motion_report,
)


@pytest.fixture
def tiny_motion_dataset(tmp_path):
    """6 takes per class (J, Z, negative), 5 resampled frames each — enough
    for a stratified split + 3-fold CV without real recorded takes."""
    data_dir = tmp_path / "motion_sequences"
    data_dir.mkdir()
    header = [f"{axis}{i}" for i in range(21) for axis in ("x", "y", "z")]
    manifest_path = data_dir / "manifest.csv"
    with open(manifest_path, "w", newline="") as manifest_file:
        writer = csv.writer(manifest_file)
        writer.writerow(["label", "source", "filepath", "num_raw_frames", "captured_at"])
        for label_seed, label in enumerate(["J", "Z", "negative"]):
            for take in range(6):
                filename = f"{label}_{take:03d}.csv"
                with open(data_dir / filename, "w", newline="") as take_file:
                    take_writer = csv.writer(take_file)
                    take_writer.writerow(header)
                    for frame in range(5):
                        drift = label_seed * 2.0 + frame * 0.3 + take * 0.01
                        take_writer.writerow([drift + i * 0.02 for i in range(63)])
                writer.writerow([label, label, filename, 5, 1787000000.0 + take])
    return str(manifest_path)


def test_load_motion_dataset_shapes(tiny_motion_dataset):
    X, y = load_motion_dataset(tiny_motion_dataset)
    assert len(X) == len(y) == 18
    assert len(X[0]) == 49
    assert set(y) == {"J", "Z", "negative"}


def test_build_candidate_models_has_two_named_models():
    models = build_candidate_models()
    assert set(models.keys()) == {"random_forest", "svm"}


def test_evaluate_model_reports_per_class_metrics(tiny_motion_dataset):
    X, y = load_motion_dataset(tiny_motion_dataset)
    model = build_candidate_models()["random_forest"]
    result = evaluate_model(model, X, y, cv_folds=3)
    assert "negative" in result["per_class_metrics"]
    for metric in ("precision", "recall", "f1"):
        assert metric in result["per_class_metrics"]["negative"]
        assert isinstance(result["per_class_metrics"]["negative"][metric], float)
        assert 0.0 <= result["per_class_metrics"]["negative"][metric] <= 1.0


def test_write_motion_report_mentions_negative_recall(tmp_path):
    results = [{
        "model": "random_forest", "cv_accuracy_mean": 0.9, "test_accuracy": 0.9,
        "precision": 0.9, "recall": 0.9, "f1": 0.9,
        "confusion_matrix": [[2, 0, 0], [0, 2, 0], [0, 0, 2]],
        "per_class_metrics": {
            "J": {"precision": 0.9, "recall": 0.9, "f1": 0.9},
            "Z": {"precision": 0.85, "recall": 0.85, "f1": 0.85},
            "negative": {"precision": 0.95, "recall": 0.95, "f1": 0.95},
        },
    }]
    out_path = tmp_path / "motion_comparison.md"
    write_motion_report(results, str(out_path))
    content = out_path.read_text()
    assert "negative" in content
    assert "0.95" in content


def test_train_and_export_produces_loadable_model(tiny_motion_dataset, tmp_path):
    model_path = tmp_path / "motion_model.pkl"
    report_path = tmp_path / "motion_comparison.md"
    summary = train_and_export(tiny_motion_dataset, str(model_path), str(report_path))

    assert os.path.exists(model_path)
    assert os.path.exists(report_path)
    assert "negative_recall" in summary

    bundle = joblib.load(model_path)
    assert set(bundle.keys()) == {"model", "classes"}
    assert set(bundle["classes"]) == {"J", "Z", "negative"}
