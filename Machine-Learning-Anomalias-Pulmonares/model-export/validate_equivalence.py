# model-export/validate_equivalence.py
import json
import sys
from pathlib import Path
from transformers import pipeline

MODEL_ID = "nickmuchi/vit-finetuned-chest-xray-pneumonia"
TEST_IMAGES_DIR = Path(__file__).parent / "test_images"
OUTPUT_PATH = Path(__file__).parent / "python_baseline_results.json"

def main():
    classifier = pipeline("image-classification", model=MODEL_ID)
    results = {}
    for image_path in sorted(TEST_IMAGES_DIR.glob("*.jpg")):
        predictions = classifier(str(image_path))
        top = predictions[0]
        results[image_path.name] = {
            "label": top["label"].upper(),
            "confidence": float(top["score"]),
        }
        print(f"{image_path.name}: {top['label'].upper()} ({top['score']:.4f})")

    OUTPUT_PATH.write_text(json.dumps(results, indent=2))
    print(f"\nBaseline guardado en {OUTPUT_PATH}")

if __name__ == "__main__":
    main()
