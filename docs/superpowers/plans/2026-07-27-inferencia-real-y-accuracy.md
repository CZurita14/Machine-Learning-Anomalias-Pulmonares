# Diagnóstico real (sin heurística) + accuracy medida Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que toda imagen subida al escáner (`POST /api/analyze-upload`) pase siempre por el modelo real de IA (nunca por el atajo de nombre de archivo), y que la confianza reportada corresponda a un modelo cuya precisión fue medida con un dataset de test real (accuracy/precision/recall/F1/matriz de confusión), no solo verificada por equivalencia de migración Python↔Node.

**Architecture:** Se añade un arnés de evaluación offline en Python (`model-export/evaluate_accuracy.py`, mismo patrón que `validate_equivalence.py`) que mide el modelo actual y candidatos contra un dataset de test etiquetado descargado. Con esos números se decide si se mantiene o se reemplaza `backend/models/*`, reusando el pipeline de exportación ONNX y el gate de equivalencia ya existentes. En el backend Node, `analysisService.ts` pierde la rama heurística por nombre de archivo: `analyzeUploadedImage` pasa a ser validar imagen → guardar → inferencia real → mapear resultado, sin bifurcación por nombre.

**Tech Stack:** Sin cambios de stack. Reusa: Python + `transformers.pipeline` (offline, `model-export/`), `onnxruntime-node` + `sharp` (backend Node, sin cambios de librerías), `node:test` (tests backend).

## Global Constraints

- El gate de equivalencia existente (`model-export/compare_with_node.mjs`, tolerancia 1 punto porcentual absoluto sobre la confianza top-1) debe seguir pasando para el modelo final antes de copiarlo a `backend/models/`.
- Toda descarga de un dataset o de pesos de un modelo requiere **confirmación explícita del usuario en el momento** de ejecutar ese paso (nombre exacto, fuente/URL, tamaño) — no descargar nada por adelantado ni asumir aprobación de este plan como luz verde para la descarga en sí.
- Criterio de selección de modelo: priorizar recall/sensibilidad de la clase PNEUMONIA sobre precisión pura (herramienta de screening; un falso negativo clínico es peor que una falsa alarma), salvo que el usuario indique otro criterio al ver los números medidos (decisión del usuario, 2026-07-27, ver spec).
- La validación `sharp(buffer).metadata()` antes de cualquier procesamiento (commit `0992b38`, cierra el riesgo de diagnóstico falso en archivos no-imagen) se mantiene intacta en todo momento.
- TDD aplica a la lógica real de Node (`backend/src/**`). Los scripts offline de `model-export/` (Python) siguen el patrón ya establecido por `validate_equivalence.py`: sin framework de test formal, con verificación manual/self-check antes de confiar en ellos con datos reales.
- Fuera de alcance (no tocar en este plan): `analyzeSampleImage` (galería de pacientes predefinidos), el Asistente IA (chat simulado), y cualquier intento de diagnóstico multiclase real (fibrosis/cardiomegalia/tuberculosis/nódulo) — el modelo se mantiene binario NORMAL/PNEUMONIA.

---

## Task 1: Preparar el dataset de test etiquetado

**Files:**
- Create: `model-export/test_dataset/normal/*.jpg` (descargadas, no versionadas en git)
- Create: `model-export/test_dataset/pneumonia/*.jpg` (descargadas, no versionadas en git)
- Create: `model-export/test_dataset/README.md`
- Modify: `model-export/.gitignore`

Sin este dataset no se puede medir accuracy real — todo lo demás depende de este paso.

- [ ] **Step 1: Buscar una fuente descargable sin autenticación**

Buscar en Hugging Face Datasets Hub un dataset de rayos X de tórax con test split etiquetado NORMAL/PNEUMONIA (el dataset de referencia histórico es "Chest X-Ray Images (Pneumonia)" de Kaggle — Kaggle requiere API key, así que se prioriza un mirror en HF Datasets Hub que no la requiera). Confirmar en el momento cuál repo existe realmente, tiene split de test, y es descargable sin credenciales — no asumir un nombre de repo exacto de antemano.

- [ ] **Step 2: Pedir confirmación explícita antes de descargar**

Mostrar al usuario: nombre exacto del dataset/repo encontrado, fuente (URL), tamaño aproximado, y número de imágenes de test por clase. Esperar aprobación explícita antes de continuar — **hard gate, no descargar sin luz verde en el momento**.

- [ ] **Step 3: Descargar y organizar en `model-export/test_dataset/`**

Estructura esperada:
```
model-export/test_dataset/
├── normal/       (todas las imágenes de test etiquetadas NORMAL)
└── pneumonia/    (todas las imágenes de test etiquetadas PNEUMONIA)
```

- [ ] **Step 4: Verificar conteo de archivos**

Run:
```bash
find model-export/test_dataset/normal -type f | wc -l
find model-export/test_dataset/pneumonia -type f | wc -l
```
Expected: el conteo coincide con lo que reportó la fuente en el Step 2 (si no coincide, investigar antes de continuar — puede indicar descarga incompleta o estructura de carpetas distinta a la esperada).

- [ ] **Step 5: Documentar la fuente**

Crear `model-export/test_dataset/README.md`:
```markdown
# Dataset de test para evaluación de accuracy

**Fuente:** <URL/repo exacto encontrado en Step 1>
**Licencia:** <la que declare la fuente>
**Descargado:** <fecha>
**Conteo:** <N> NORMAL, <N> PNEUMONIA (test split, no usado en entrenamiento)

Usado por `model-export/evaluate_accuracy.py` para medir accuracy real del
modelo de clasificación (no solo equivalencia de migración Python↔Node,
ver `validate_equivalence.py`/`compare_with_node.mjs` para eso).

## Cómo re-descargar
<comando(s) exactos usados en Step 3, para que sea reproducible>
```

- [ ] **Step 6: Gitignorar las imágenes descargadas (regenerables, pesan demasiado para versionar)**

Modificar `model-export/.gitignore`:
```
.venv/
output/
test_dataset/*/
!test_dataset/README.md
```

- [ ] **Step 7: Commit**

```bash
git add model-export/.gitignore model-export/test_dataset/README.md
git commit -m "docs: document accuracy test dataset source (images gitignored, regenerable)"
```

---

## Task 2: Arnés de evaluación de accuracy (`model-export/evaluate_accuracy.py`)

**Files:**
- Create: `model-export/evaluate_accuracy.py`

**Interfaces:**
- Produces: `compute_metrics(true_labels: list[str], pred_labels: list[str]) -> dict` (lógica pura, testeable sin modelo ni dataset)
- Produces: CLI `python evaluate_accuracy.py --model-id <id> [--dataset-dir <path>] [--output <path>]`, escribe/actualiza `model-export/accuracy_results.json`

- [ ] **Step 1: Escribir `compute_metrics()` (lógica pura)**

```python
# model-export/evaluate_accuracy.py
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from transformers import pipeline


def compute_metrics(true_labels, pred_labels):
    """true_labels/pred_labels: listas paralelas de 'NORMAL'/'PNEUMONIA'."""
    tp = sum(1 for t, p in zip(true_labels, pred_labels) if t == 'PNEUMONIA' and p == 'PNEUMONIA')
    fn = sum(1 for t, p in zip(true_labels, pred_labels) if t == 'PNEUMONIA' and p == 'NORMAL')
    fp = sum(1 for t, p in zip(true_labels, pred_labels) if t == 'NORMAL' and p == 'PNEUMONIA')
    tn = sum(1 for t, p in zip(true_labels, pred_labels) if t == 'NORMAL' and p == 'NORMAL')

    total = tp + fn + fp + tn
    accuracy = (tp + tn) / total if total else 0.0

    precision_pneumonia = tp / (tp + fp) if (tp + fp) else 0.0
    recall_pneumonia = tp / (tp + fn) if (tp + fn) else 0.0
    f1_pneumonia = (
        2 * precision_pneumonia * recall_pneumonia / (precision_pneumonia + recall_pneumonia)
        if (precision_pneumonia + recall_pneumonia) else 0.0
    )

    precision_normal = tn / (tn + fn) if (tn + fn) else 0.0
    recall_normal = tn / (tn + fp) if (tn + fp) else 0.0
    f1_normal = (
        2 * precision_normal * recall_normal / (precision_normal + recall_normal)
        if (precision_normal + recall_normal) else 0.0
    )

    return {
        "n_total": total,
        "accuracy": accuracy,
        "confusion_matrix": {"tp_pneumonia": tp, "fn_pneumonia": fn, "fp_pneumonia": fp, "tn_normal": tn},
        "pneumonia": {"precision": precision_pneumonia, "recall": recall_pneumonia, "f1": f1_pneumonia},
        "normal": {"precision": precision_normal, "recall": recall_normal, "f1": f1_normal},
    }
```

- [ ] **Step 2: Verificar `compute_metrics()` manualmente antes de confiarle datos reales**

Run:
```bash
cd model-export
python -c "
from evaluate_accuracy import compute_metrics
m = compute_metrics(
    ['PNEUMONIA', 'PNEUMONIA', 'NORMAL', 'NORMAL'],
    ['PNEUMONIA', 'NORMAL',    'NORMAL', 'PNEUMONIA'],
)
assert m['accuracy'] == 0.5, m
assert m['confusion_matrix'] == {'tp_pneumonia': 1, 'fn_pneumonia': 1, 'fp_pneumonia': 1, 'tn_normal': 1}, m
assert m['pneumonia']['precision'] == 0.5 and m['pneumonia']['recall'] == 0.5, m
print('OK', m)
"
```
Expected: imprime `OK {...}` sin `AssertionError`. Este caso de prueba (2 aciertos, 2 fallos, uno de cada tipo) verifica que la matriz de confusión y las fórmulas de precision/recall no estén invertidas antes de correr el arnés sobre el dataset real.

- [ ] **Step 3: Escribir `evaluate_model()` y el CLI (`main()`)**

Añadir a `model-export/evaluate_accuracy.py`:
```python
def evaluate_model(model_id: str, dataset_dir: Path):
    classifier = pipeline("image-classification", model=model_id)
    true_labels = []
    pred_labels = []

    for true_label, subdir in (("NORMAL", "normal"), ("PNEUMONIA", "pneumonia")):
        image_dir = dataset_dir / subdir
        image_paths = sorted(
            p for ext in ("*.jpg", "*.jpeg", "*.png") for p in image_dir.glob(ext)
        )
        if not image_paths:
            raise FileNotFoundError(f"No se encontraron imágenes en {image_dir}")
        for image_path in image_paths:
            prediction = classifier(str(image_path))[0]
            true_labels.append(true_label)
            pred_labels.append(prediction["label"].upper())

    return compute_metrics(true_labels, pred_labels)


def main():
    parser = argparse.ArgumentParser(description="Evalúa accuracy real de un modelo de clasificación de rayos X.")
    parser.add_argument("--model-id", required=True, help="ID del modelo en Hugging Face Hub")
    parser.add_argument(
        "--dataset-dir",
        default=str(Path(__file__).parent / "test_dataset"),
        help="Directorio con subcarpetas normal/ y pneumonia/",
    )
    parser.add_argument("--output", default=str(Path(__file__).parent / "accuracy_results.json"))
    args = parser.parse_args()

    dataset_dir = Path(args.dataset_dir)
    metrics = evaluate_model(args.model_id, dataset_dir)
    metrics["model_id"] = args.model_id
    metrics["dataset_dir"] = str(dataset_dir)
    metrics["evaluated_at"] = datetime.now(timezone.utc).isoformat()

    output_path = Path(args.output)
    existing = json.loads(output_path.read_text()) if output_path.exists() else {}
    existing[args.model_id] = metrics
    output_path.write_text(json.dumps(existing, indent=2))

    print(f"\n=== {args.model_id} ===")
    print(f"Accuracy: {metrics['accuracy']:.4f} ({metrics['n_total']} imágenes)")
    print(
        f"PNEUMONIA -> precision={metrics['pneumonia']['precision']:.4f} "
        f"recall={metrics['pneumonia']['recall']:.4f} f1={metrics['pneumonia']['f1']:.4f}"
    )
    print(
        f"NORMAL    -> precision={metrics['normal']['precision']:.4f} "
        f"recall={metrics['normal']['recall']:.4f} f1={metrics['normal']['f1']:.4f}"
    )
    print(f"Matriz de confusión: {metrics['confusion_matrix']}")
    print(f"\nResultados guardados en {output_path}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Smoke test contra las 2 imágenes ya conocidas**

Run (usa `model-export/test_images/`, reorganizándolas temporalmente para que coincidan con la estructura `normal/`/`pneumonia/` que espera el script):
```bash
cd model-export
mkdir -p /tmp/smoke_dataset/normal /tmp/smoke_dataset/pneumonia
cp test_images/sample_normal.jpg /tmp/smoke_dataset/normal/
cp test_images/sample_pneumonia.jpg /tmp/smoke_dataset/pneumonia/
python evaluate_accuracy.py --model-id nickmuchi/vit-finetuned-chest-xray-pneumonia --dataset-dir /tmp/smoke_dataset --output /tmp/smoke_results.json
```
Expected: accuracy 0.5 (1/2), con `sample_pneumonia.jpg` correctamente clasificado y `sample_normal.jpg` clasificado como PNEUMONIA — esto coincide exactamente con lo ya medido en vivo el 2026-07-27 (Python baseline: NORMAL→0.615 PNEUMONIA, PNEUMONIA→0.683 PNEUMONIA) y confirma que el arnés reproduce el comportamiento real conocido antes de usarlo sobre el dataset grande.

- [ ] **Step 5: Commit**

```bash
git add model-export/evaluate_accuracy.py
git commit -m "feat: add reusable accuracy evaluation harness (model-export/evaluate_accuracy.py)"
```

---

## Task 3: Medir el modelo actual contra el dataset de test real

**Files:**
- Modify: `model-export/accuracy_results.json` (creado por el script en Task 2)

- [ ] **Step 1: Ejecutar el arnés contra el modelo actual**

Run:
```bash
cd model-export
python evaluate_accuracy.py --model-id nickmuchi/vit-finetuned-chest-xray-pneumonia --dataset-dir test_dataset
```
Expected: termina sin error, imprime accuracy/precision/recall/F1/matriz de confusión, y actualiza `model-export/accuracy_results.json` con la entrada `"nickmuchi/vit-finetuned-chest-xray-pneumonia"`.

- [ ] **Step 2: Commit**

```bash
git add model-export/accuracy_results.json
git commit -m "test: measure real accuracy of current model against labeled test set"
```

**⏸ Checkpoint: mostrar las métricas completas al usuario (accuracy, recall/precision/F1 por clase, matriz de confusión) antes de decidir si se investigan modelos candidatos (Task 4) — si el desempeño ya es sólido, Task 4 podría saltarse por decisión del usuario.**

---

## Task 4: Investigar y benchmarkear modelos candidatos

**Files:**
- Modify: `model-export/accuracy_results.json`

- [ ] **Step 1: Buscar 2-3 candidatos**

Buscar en Hugging Face Hub modelos de clasificación binaria de rayos X de tórax (NORMAL/PNEUMONIA) con cierta tracción (descargas/likes) distintos al actual. Confirmar de cada candidato: que expone `id2label` compatible (NORMAL/PNEUMONIA, sin importar mayúsculas), y que es cargable con `transformers.pipeline("image-classification", model=<id>)` sin configuración especial.

- [ ] **Step 2: Ejecutar el arnés contra cada candidato**

Run (repetir por cada candidato encontrado en Step 1):
```bash
cd model-export
python evaluate_accuracy.py --model-id <candidato_id> --dataset-dir test_dataset
```
Expected: cada corrida agrega una entrada nueva a `model-export/accuracy_results.json` sin sobrescribir las anteriores.

- [ ] **Step 3: Comparar y presentar al usuario**

Armar una tabla comparativa (accuracy, recall/precision/F1 de PNEUMONIA, matriz de confusión) de todos los modelos evaluados (actual + candidatos) leyendo `model-export/accuracy_results.json`.

- [ ] **Step 4: Commit**

```bash
git add model-export/accuracy_results.json
git commit -m "test: benchmark candidate pretrained models against labeled test set"
```

**⏸ Checkpoint obligatorio: presentar la tabla comparativa completa al usuario y esperar su decisión explícita sobre qué modelo usar (mantener el actual, o adoptar uno de los candidatos) antes de tocar `backend/models/`. Recordar el criterio por defecto acordado (priorizar recall en PNEUMONIA) pero la decisión final es del usuario.**

---

## Task 5: Re-exportar a ONNX el modelo elegido (si cambia) y re-validar equivalencia

**Files:**
- Modify: `model-export/export_to_onnx.sh`
- Modify: `model-export/validate_equivalence.py`
- Modify: `model-export/python_baseline_results.json`

Si el usuario decidió en el checkpoint de Task 4 **mantener** el modelo actual: este task se salta por completo (no hay nada que re-exportar), ir directo a Task 6 confirmando que `backend/models/*` ya contiene el modelo correcto.

Si el usuario decidió **cambiar** de modelo:

- [ ] **Step 1: Actualizar `MODEL_ID` en el script de exportación**

Modificar `model-export/export_to_onnx.sh` línea 4: reemplazar `MODEL_ID="nickmuchi/vit-finetuned-chest-xray-pneumonia"` por el ID del modelo elegido.

- [ ] **Step 2: Ejecutar la exportación**

Run:
```bash
cd model-export
source .venv/Scripts/activate   # Windows Git Bash
./export_to_onnx.sh
```
Expected: `model-export/output/` contiene `model.onnx`, `config.json`, `preprocessor_config.json`.

- [ ] **Step 3: Inspeccionar los archivos generados**

Run: `cat model-export/output/preprocessor_config.json` y `cat model-export/output/config.json`
Anotar: `image_mean`, `image_std`, `size`, `do_normalize`, `do_rescale`, `rescale_factor`, `resample`, y el mapeo real de `id2label`. Si el `resample` difiere del `2` (bilinear) ya soportado por `resampleToSharpKernel()` en `backend/src/utils/imagePreprocess.ts`, o si `id2label` no es exactamente `{"0": "NORMAL", "1": "PNEUMONIA"}` (en cualquier orden), **detenerse y avisar al usuario** — el pipeline de preprocesamiento Node puede necesitar ajustes antes de continuar.

- [ ] **Step 4: Actualizar `validate_equivalence.py` y regenerar el baseline Python**

Modificar `model-export/validate_equivalence.py` línea 7: `MODEL_ID = "<nuevo modelo elegido>"`.

Run:
```bash
cd model-export
python validate_equivalence.py
```
Expected: regenera `model-export/python_baseline_results.json` con las predicciones del nuevo modelo sobre `test_images/sample_normal.jpg` y `sample_pneumonia.jpg`.

- [ ] **Step 5: Copiar el modelo nuevo a `backend/models/` (temporalmente, para el gate) y correr el gate de equivalencia**

```bash
cp model-export/output/model.onnx backend/models/model.onnx
cp model-export/output/config.json backend/models/config.json
cp model-export/output/preprocessor_config.json backend/models/preprocessor_config.json
cd backend
MODEL_DIR=../backend/models node --import ./node_modules/tsx/dist/loader.mjs ../model-export/compare_with_node.mjs
```
Expected: `✅ Equivalencia confirmada dentro de la tolerancia.` (exit code 0). Si falla (`❌ Hay discrepancias...`), no continuar — investigar la causa (posible ajuste de preprocesamiento, ver Step 3) antes de aceptar el modelo nuevo.

- [ ] **Step 6: Commit**

```bash
git add model-export/export_to_onnx.sh model-export/validate_equivalence.py model-export/python_baseline_results.json backend/models
git commit -m "feat: switch chest-xray model to <nuevo modelo elegido> (measured accuracy improvement)"
```

---

## Task 6: Confirmar el modelo final integrado en `backend/models/`

**Files:**
- Verify: `backend/models/model.onnx`, `backend/models/config.json`, `backend/models/preprocessor_config.json`

- [ ] **Step 1: Levantar el backend y confirmar carga correcta del modelo**

Run:
```bash
cd backend
npm run dev
```
Expected: imprime `¡Modelo ONNX cargado exitosamente!` y `API ejecutándose y escuchando en todas las interfaces: http://0.0.0.0:8000` sin error.

- [ ] **Step 2: Correr la suite de tests y typecheck existentes**

Run:
```bash
cd backend
npm test
npm run typecheck
```
Expected: todos los tests pasan (18/18 o el conteo vigente), typecheck limpio. Esto confirma que el cambio de modelo (si lo hubo) no rompió nada del lado Node — la lógica de `inferenceService.ts` es agnóstica al modelo específico, solo depende del contrato `pixel_values`→`logits` + `id2label`, ya verificado en Task 5 Step 3/5.

- [ ] **Step 3: Detener el servidor de desarrollo**

Cerrar el proceso de `npm run dev` iniciado en Step 1 (no dejarlo corriendo de fondo innecesariamente entre tasks).

---

## Task 7: Eliminar la heurística de nombre de archivo del flujo de subida (TDD)

**Files:**
- Modify: `backend/src/services/analysisService.ts`
- Modify: `backend/src/services/analysisService.test.ts`
- Modify: `backend/src/controllers/analyze.controller.ts`

**Interfaces:**
- Consumes: `runInference(buffer: Buffer): Promise<Prediction>` y `type Prediction = { label: string; confidence: number }` (ya existen en `backend/src/services/inferenceService.ts`)
- Produces: `mapPredictionToAnalysisResult(prediction: Prediction, savedPath: string): AnalysisResult` (nueva función pura, exportada)
- Produces: `analyzeUploadedImage(buffer: Buffer): Promise<AnalysisResult>` (firma cambia: **ya no recibe `originalFilename`**, porque no queda ningún uso de ese parámetro tras quitar la heurística)

- [ ] **Step 1: Escribir los tests que fallan para la nueva función pura**

Reemplazar el contenido completo de `backend/src/services/analysisService.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeUploadedImage, mapPredictionToAnalysisResult } from './analysisService.js';

test('mapPredictionToAnalysisResult mapea PNEUMONIA a anomaly_detected=true con el texto clínico esperado', () => {
  const result = mapPredictionToAnalysisResult({ label: 'PNEUMONIA', confidence: 0.83 }, 'uploads/upload_abc123.jpg');
  assert.equal(result.anomaly_detected, true);
  assert.equal(result.disease, 'Infiltrado pulmonar / Posible Neumonía');
  assert.equal(result.confidence, 0.83);
  assert.deepEqual(result.zones, ['Análisis global (ViT)']);
  assert.equal(result.saved_path, 'uploads/upload_abc123.jpg');
});

test('mapPredictionToAnalysisResult mapea NORMAL a anomaly_detected=false sin zonas', () => {
  const result = mapPredictionToAnalysisResult({ label: 'NORMAL', confidence: 0.91 }, 'uploads/upload_def456.jpg');
  assert.equal(result.anomaly_detected, false);
  assert.equal(result.disease, 'Pulmones Sanos');
  assert.deepEqual(result.zones, []);
  assert.equal(result.saved_path, 'uploads/upload_def456.jpg');
});

test('analyzeUploadedImage rechaza un buffer que no es una imagen decodificable', async () => {
  const notAnImage = Buffer.from('this is not an image');
  await assert.rejects(() => analyzeUploadedImage(notAnImage));
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `cd backend && npm test`
Expected: FAIL — `mapPredictionToAnalysisResult` no existe todavía en `analysisService.ts`, y `analyzeUploadedImage` todavía exige 2 argumentos.

- [ ] **Step 3: Reescribir `analysisService.ts` sin la heurística**

Reemplazar el contenido completo de `backend/src/services/analysisService.ts`:
```ts
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { env } from '../config/env.js';
import { runInference } from './inferenceService.js';
import type { Prediction } from './inferenceService.js';
import type { AnalysisResult } from '../schemas/analyze.schemas.js';

export function mapPredictionToAnalysisResult(prediction: Prediction, savedPath: string): AnalysisResult {
  const anomalyDetected = prediction.label === 'PNEUMONIA';
  return {
    anomaly_detected: anomalyDetected,
    disease: anomalyDetected ? 'Infiltrado pulmonar / Posible Neumonía' : 'Pulmones Sanos',
    confidence: prediction.confidence,
    zones: anomalyDetected ? ['Análisis global (ViT)'] : [],
    saved_path: savedPath,
  };
}

export async function analyzeUploadedImage(buffer: Buffer): Promise<AnalysisResult> {
  // Validar que el buffer sea una imagen realmente decodificable antes de
  // ejecutar la inferencia. Lectura de metadata (solo cabecera) es barata y
  // lanza en input inválido.
  await sharp(buffer).metadata();

  const savedFilename = `upload_${randomUUID().slice(0, 8)}.jpg`;
  const savedPath = path.join(env.UPLOADS_DIR, savedFilename);
  await writeFile(savedPath, buffer);

  const prediction = await runInference(buffer);
  return mapPredictionToAnalysisResult(prediction, savedPath);
}

export function analyzeSampleImage(imageName: string): AnalysisResult {
  const isPneumonia = imageName.toLowerCase().includes('pneumonia');
  const confidence = isPneumonia
    ? 0.89 + Math.random() * (0.98 - 0.89)
    : 0.92 + Math.random() * (0.99 - 0.92);

  return {
    anomaly_detected: isPneumonia,
    disease: isPneumonia ? 'Infiltrado pulmonar (Muestra)' : 'Pulmones Sanos (Muestra)',
    confidence,
    zones: [],
    saved_path: null,
  };
}
```

- [ ] **Step 4: Actualizar el controller (ya no pasa `originalname`)**

En `backend/src/controllers/analyze.controller.ts`, línea 11, reemplazar:
```ts
    const result = await analyzeUploadedImage(req.file.buffer, req.file.originalname);
```
por:
```ts
    const result = await analyzeUploadedImage(req.file.buffer);
```

- [ ] **Step 5: Correr tests y typecheck, verificar que pasan**

Run:
```bash
cd backend
npm test
npm run typecheck
```
Expected: todos los tests PASS, typecheck limpio (sin referencias colgantes a `analyzeByFilenameHeuristic` ni al parámetro `originalFilename` eliminado).

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/analysisService.ts backend/src/services/analysisService.test.ts backend/src/controllers/analyze.controller.ts
git commit -m "fix: remove filename-based diagnosis shortcut, always run real ViT inference on upload"
```

---

## Task 8: Actualizar documentación con el comportamiento real y las métricas medidas

**Files:**
- Modify: `GUIA_EJECUCION.md`
- Modify: `README.md`

- [ ] **Step 1: Quitar el tip de la demo multiclase en `GUIA_EJECUCION.md`**

Eliminar la línea 55 completa:
```
*   **Demostración Multiclase:** Recuerda usar las palabras clave en los nombres de las imágenes para que el sistema arroje patologías exactas al instante durante la exposición (Ej: `rx_fibrosis.jpg`, `nodulo_pulmon.png`, `cardiomegalia.jpg`).
```
(ya no aplica: toda imagen subida corre inferencia real, sin importar el nombre del archivo).

- [ ] **Step 2: Actualizar la sección de modelos en `README.md`**

Reemplazar las líneas 11 y 13 de `README.md` (que describen la "Simulación Multiclase (Heurística)") por:
```markdown
*   **Tipo de Tarea:** Clasificación Binaria (Image Classification).
*   **Funcionamiento Real:** Este modelo divide la radiografía en múltiples "parches" y utiliza mecanismos de atención (Self-Attention) para detectar opacidades asociadas a una Neumonía. Toda imagen subida por el usuario se procesa siempre con este modelo real — no existe ningún atajo por nombre de archivo.
```

- [ ] **Step 3: Agregar sección de accuracy medida en `README.md`**

Generar la tabla directamente desde `model-export/accuracy_results.json` (evita transcribir números a mano):
```bash
cd model-export
python -c "
import json
results = json.load(open('accuracy_results.json'))
model_id = '<ID exacto del modelo integrado en backend/models/, confirmado en el checkpoint de Task 4>'
m = results[model_id]
print(f'''
## 📊 Accuracy medida del modelo

Evaluado contra un dataset de test etiquetado real (ver \`model-export/test_dataset/README.md\`
para la fuente), no solo contra las 2 imágenes de muestra usadas para el gate de equivalencia
de migración. Modelo: \`{model_id}\`.

| Métrica | Valor |
|---|---|
| Accuracy global | {m[\"accuracy\"]:.2%} ({m[\"n_total\"]} imágenes) |
| Recall (PNEUMONIA) | {m[\"pneumonia\"][\"recall\"]:.2%} |
| Precision (PNEUMONIA) | {m[\"pneumonia\"][\"precision\"]:.2%} |
| F1 (PNEUMONIA) | {m[\"pneumonia\"][\"f1\"]:.2%} |
| Matriz de confusión | {m[\"confusion_matrix\"]} |

Metodología completa y script reutilizable: \`model-export/evaluate_accuracy.py\`.
''')
"
```
Insertar el bloque impreso tal cual, después de la sección `## 🧠 Modelos de Machine Learning Utilizados` de `README.md`.

- [ ] **Step 4: Actualizar el paso 4 del flujo de ejecución en `README.md`**

Reemplazar la línea 68:
```
4. Si el nombre del archivo contiene una palabra clave reconocida (atajo de demo, ver sección de Modelos arriba), se devuelve el diagnóstico simulado correspondiente sin ejecutar el modelo.
```
por:
```
4. `sharp` valida que el archivo sea una imagen realmente decodificable (rechaza archivos no-imagen antes de cualquier procesamiento).
```
Y renumerar los pasos siguientes (5-8) en consecuencia.

- [ ] **Step 5: Commit**

```bash
git add GUIA_EJECUCION.md README.md
git commit -m "docs: remove filename-heuristic demo tip, document real measured accuracy"
```

---

## Task 9: Validación final en vivo (API + UI)

**Files:** ninguno (solo verificación manual)

- [ ] **Step 1: Levantar backend y frontend**

Run:
```bash
cd backend && npm run dev &
cd frontend && python -m http.server 5500 &
```
Expected: backend en `http://0.0.0.0:8000`, frontend accesible en `http://localhost:5500/index.html`.

- [ ] **Step 2: Confirmar que el nombre de archivo ya no activa ningún atajo**

Run:
```bash
cp model-export/test_images/sample_pneumonia.jpg /tmp/fibrosis_test.jpg
curl -s -X POST http://127.0.0.1:8000/api/analyze-upload -F "file=@/tmp/fibrosis_test.jpg"
```
Expected: el diagnóstico devuelto es `Infiltrado pulmonar / Posible Neumonía` (viene del modelo real) — **no** `Posible Fibrosis Pulmonar` (que era el resultado antes de este plan, pese a que la imagen es la misma radiografía de neumonía real). Esto confirma que la heurística por nombre ya no existe.

- [ ] **Step 3: Re-probar los 2 casos de siempre + el caso de archivo no-imagen**

Repetir exactamente las 3 pruebas ya documentadas el 2026-07-27 (API directa con `sample_normal.jpg`, `sample_pneumonia.jpg`, y un archivo no-imagen renombrado a `.jpg`), y la prueba de UI vía Playwright subiendo ambas imágenes de muestra. Comparar los resultados con las métricas de `accuracy_results.json` del modelo final — si `sample_normal.jpg` sigue siendo clasificado como PNEUMONIA, verificar si eso es consistente con la tasa de falsos positivos medida (no debería sorprender si el modelo elegido tiene <100% recall/precision) o si amerita revisión adicional.

- [ ] **Step 4: Detener los procesos de prueba**

Cerrar los procesos de `npm run dev` y `python -m http.server` iniciados en Step 1.

**⏸ Checkpoint final: mostrar al usuario un resumen — diagnóstico real en el 100% de las subidas (sin heurística), métricas de accuracy medidas del modelo final, y evidencia de las pruebas en vivo — antes de considerar este trabajo listo para `superpowers:finishing-a-development-branch`.**
