#!/usr/bin/env bash
set -euo pipefail

MODEL_ID="nickmuchi/vit-finetuned-chest-xray-pneumonia"
OUTPUT_DIR="$(dirname "$0")/output"

echo "Exportando $MODEL_ID a ONNX en $OUTPUT_DIR ..."
optimum-cli export onnx \
  --model "$MODEL_ID" \
  --task image-classification \
  "$OUTPUT_DIR"

echo "Listo. Archivos generados:"
ls -la "$OUTPUT_DIR"
