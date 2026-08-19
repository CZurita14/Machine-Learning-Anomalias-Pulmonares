# Migración Backend FastAPI → Node.js/Express (TypeScript) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el backend Python/FastAPI actual (`backend/main.py`) por un backend Node.js/Express en TypeScript funcionalmente equivalente, incluyendo el motor de IA (ViT chest-xray) exportado a ONNX y corrido con `onnxruntime-node`, sin dependencia de Python en runtime, manteniendo el frontend vanilla JS existente con cambios mínimos.

**Architecture:** `routes/ → controllers/ → services/` sobre Express, validación con Zod como única fuente de verdad de los schemas, configuración centralizada vía `dotenv` + Zod, middlewares para carga de archivos (multer), verificación de modelo listo (503 real) y manejo centralizado de errores. La exportación del modelo a ONNX es un paso **offline** (Python, fuera del backend) cuyo artefacto (`model.onnx` + `config.json` + `preprocessor_config.json`) se versiona con Git LFS y se carga en runtime solo con `onnxruntime-node`.

**Tech Stack:** TypeScript + `tsx` (sin build step), Express 4, Zod, Multer, `onnxruntime-node`, `sharp` (preprocesamiento de imagen, equivalente Node de Pillow), Git LFS. Test runner: `node:test` built-in de Node (vía `tsx`, sin dependencia extra). Node objetivo: `>=24` (versión LTS local confirmada: `v24.15.0`).

**Decisiones ya confirmadas por el usuario:** TypeScript, Zod, ONNX local vía `optimum-cli`, sin base de datos (stateless), `uploads/` con validación real de tamaño/MIME, Git LFS para el `.onnx`, `legacy-python-backend/` para archivar el backend Python al final.

**Decisiones técnicas adicionales tomadas en este plan (a confirmar cuando se muestre cada task):**
- ESM (`"type": "module"`) + `tsconfig` `NodeNext`, por ser el estándar actual en proyectos Node nuevos.
- `sharp` para decodificar/redimensionar imágenes en Node (no hay equivalente 1:1 de Pillow; `sharp` es el estándar de facto, usa libvips).
- `multer@^2.2.0` (el plan original decía `^1.4.5-lts.1`). Al correr `npm install` en Task 2, npm marcó Multer 1.x como deprecado por vulnerabilidades ya parcheadas en 2.x — específicamente **CVE-2025-47944**: denial-of-service por una excepción no manejada al procesar un payload `multipart/form-data` malformado, parcheado en Multer `2.0.2`. Se usa `@types/multer@^2.2.0` en consecuencia. **Nota para Task 8:** la firma del callback de `fileFilter` cambió entre Multer 1.x y 2.x — verificar la firma correcta de 2.x al implementar el middleware de upload, no guiarse por ejemplos de documentación de la 1.x.
- TDD se aplica a código con lógica real (preprocesamiento, inferencia/postprocesamiento, validación de schemas, middleware de errores, fix del frontend). No se escriben tests falsos para archivos de puro andamiaje (`package.json`, `tsconfig.json`) — no aportan valor.
- El `preprocessor_config.json` y `config.json` (para `id2label`) del modelo se copian tal cual desde la exportación y se **leen en runtime**, en vez de hardcodear sus valores en TypeScript, para que el preprocesamiento siga siendo fiel al modelo real incluso si se re-exporta en el futuro.

---

## Task 1: Reorganización del repo (archivar backend Python, preparar Git LFS)

**Files:**
- Move: `backend/main.py` → `legacy-python-backend/main.py`
- Move: `backend/requirements.txt` → `legacy-python-backend/requirements.txt`
- Move: `backend/samples/*` → `legacy-python-backend/samples/`
- Create: `.gitattributes` (modify, agregar tracking LFS)
- Create: `model-export/test_images/sample_normal.jpg`, `model-export/test_images/sample_pneumonia.jpg` (copias, no moves, de las 2 imágenes originales de demo — se usan en Task 7 para la validación de equivalencia)

No se borra el backend Python todavía: se necesita como referencia de "ground truth" para la validación de equivalencia del modelo (Task 7). Se archiva ahora para que `backend/` quede libre para el nuevo proyecto Node, pero permanece disponible.

- [ ] **Step 1: Verificar working tree limpio antes de mover archivos**

Run: `git status`
Expected: `nothing to commit, working tree clean` (si no está limpio, detente y avisa al usuario antes de continuar).

- [ ] **Step 2: Crear `legacy-python-backend/` y mover el backend Python con `git mv`**

```bash
mkdir -p legacy-python-backend
git mv backend/main.py legacy-python-backend/main.py
git mv backend/requirements.txt legacy-python-backend/requirements.txt
git mv backend/samples legacy-python-backend/samples
```

- [ ] **Step 3: Copiar (no mover) las 2 imágenes de demo limpias a `model-export/test_images/` para la validación futura**

```bash
mkdir -p model-export/test_images
cp legacy-python-backend/samples/sample_normal.jpg model-export/test_images/sample_normal.jpg
cp legacy-python-backend/samples/sample_pneumonia.jpg model-export/test_images/sample_pneumonia.jpg
```

- [ ] **Step 4: Configurar Git LFS para el futuro artefacto `.onnx`**

```bash
git lfs install
git lfs track "*.onnx"
```

Esto agrega/actualiza `.gitattributes`. Verifica que quedó así (además de la línea existente):

```gitattributes
# Auto detect text files and perform LF normalization
* text=auto
*.onnx filter=lfs diff=lfs merge=lfs -text
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: archive Python backend, prepare Git LFS for ONNX artifact"
git status
```

Expected: working tree limpio, `backend/` ya no contiene `main.py`/`requirements.txt`/`samples/`.

---

## Task 2: Andamiaje del nuevo backend Node/TypeScript

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/.gitignore`
- Create: `backend/src/server.ts` (placeholder mínimo, se completa en Task 8)
- Create dirs (vacíos con `.gitkeep` donde aplique): `backend/src/routes/`, `backend/src/controllers/`, `backend/src/services/`, `backend/src/middlewares/`, `backend/src/config/`, `backend/src/schemas/`, `backend/src/utils/`, `backend/models/`, `backend/uploads/`

- [ ] **Step 1: Crear `backend/package.json`**

```json
{
  "name": "medai-scanner-backend",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=24.0.0"
  },
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "start": "tsx src/server.ts",
    "typecheck": "tsc --noEmit",
    "test": "node --import tsx --test \"src/**/*.test.ts\""
  },
  "dependencies": {
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.21.1",
    "multer": "^2.2.0",
    "onnxruntime-node": "^1.19.2",
    "sharp": "^0.33.5",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/multer": "^2.2.0",
    "@types/node": "^22.10.2",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2"
  }
}
```

- [ ] **Step 2: Crear `backend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "noUncheckedIndexedAccess": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Crear `backend/.gitignore`**

```gitignore
node_modules/
dist/
uploads/*
!uploads/.gitkeep
.env
```

- [ ] **Step 4: Crear la estructura de carpetas y placeholders**

```bash
mkdir -p backend/src/routes backend/src/controllers backend/src/services backend/src/middlewares backend/src/config backend/src/schemas backend/src/utils backend/models backend/uploads
touch backend/uploads/.gitkeep backend/models/.gitkeep
```

- [ ] **Step 5: Crear `backend/src/server.ts` placeholder mínimo (se reemplaza en Task 8)**

```typescript
console.log("MedAI Scanner backend scaffold OK — server real se implementa en Task 8");
```

- [ ] **Step 6: Instalar dependencias**

Run (desde `backend/`): `npm install`
Expected: instala sin errores, genera `package-lock.json` y `node_modules/`.

- [ ] **Step 7: Verificar el scaffold arranca**

Run: `npm run dev` (desde `backend/`, luego detener con Ctrl+C)
Expected: imprime `MedAI Scanner backend scaffold OK — server real se implementa en Task 8` sin errores de TypeScript.

- [ ] **Step 8: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/tsconfig.json backend/.gitignore backend/src backend/models/.gitkeep backend/uploads/.gitkeep
git commit -m "feat: scaffold Node/TypeScript backend structure"
```

**⏸ Checkpoint (pedido explícito del usuario): mostrar Task 1 + Task 2 y esperar aprobación antes de continuar con Task 3.**

---

## Task 3: Capa de configuración (`dotenv` + Zod)

**Files:**
- Create: `backend/.env.example`
- Create: `backend/src/config/env.ts`
- Test: `backend/src/config/env.test.ts`

- [ ] **Step 1: Escribir el test de validación de env**

```typescript
// backend/src/config/env.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEnv } from './env.js';

test('aplica defaults cuando no hay variables seteadas', () => {
  const env = loadEnv({});
  assert.equal(env.PORT, 8000);
  assert.equal(env.CORS_ORIGIN, '*');
  assert.equal(env.MODEL_DIR, './models');
  assert.equal(env.UPLOADS_DIR, './uploads');
  assert.equal(env.MAX_UPLOAD_MB, 10);
});

test('castea PORT y MAX_UPLOAD_MB de string a number', () => {
  const env = loadEnv({ PORT: '9000', MAX_UPLOAD_MB: '25' });
  assert.equal(env.PORT, 9000);
  assert.equal(env.MAX_UPLOAD_MB, 25);
});

test('lanza si PORT no es un entero positivo', () => {
  assert.throws(() => loadEnv({ PORT: 'no-es-numero' }));
});
```

- [ ] **Step 2: Correr el test y verificar que falla (no existe `env.ts` todavía)**

Run: `npm test` (desde `backend/`)
Expected: FAIL — `Cannot find module './env.js'`.

- [ ] **Step 3: Implementar `backend/src/config/env.ts`**

```typescript
// backend/src/config/env.ts
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8000),
  CORS_ORIGIN: z.string().default('*'),
  MODEL_DIR: z.string().default('./models'),
  UPLOADS_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(10),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
  }
  return parsed.data;
}

export const env: Env = loadEnv(process.env);
```

Nota: la carga de `dotenv` (`import 'dotenv/config'`) se hace en `server.ts` (Task 8), antes de importar `env.ts`, para no acoplar el módulo de config a un side-effect de lectura de archivo — así `env.test.ts` puede probar `loadEnv()` de forma pura sin depender de un `.env` real en disco.

- [ ] **Step 4: Correr el test de nuevo**

Run: `npm test`
Expected: PASS (3/3 tests).

- [ ] **Step 5: Crear `backend/.env.example`**

```
PORT=8000
CORS_ORIGIN=*
MODEL_DIR=./models
UPLOADS_DIR=./uploads
MAX_UPLOAD_MB=10
```

- [ ] **Step 6: Typecheck y commit**

```bash
npm run typecheck
git add backend/.env.example backend/src/config
git commit -m "feat: add Zod-validated env config layer"
```

**⏸ Checkpoint: mostrar Task 3 antes de continuar con Task 4 (exportación del modelo).**

---

## Task 4: Exportación offline del modelo a ONNX (`model-export/`)

**Files:**
- Create: `model-export/requirements.txt`
- Create: `model-export/export_to_onnx.sh`
- Create: `model-export/README.md`

Este paso corre **fuera** del backend Node, en el entorno Python que ya existe para el proyecto (el mismo que usa `legacy-python-backend/requirements.txt`, más las herramientas de exportación).

- [ ] **Step 1: Crear `model-export/requirements.txt`**

```
transformers>=4.35.0
torch>=2.1.0
optimum[exporters]>=1.23.0
onnx>=1.16.0
onnxruntime>=1.19.0
Pillow>=10.0.0
```

- [ ] **Step 2: Crear `model-export/export_to_onnx.sh`**

```bash
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
```

- [ ] **Step 3: Crear `model-export/README.md` con instrucciones**

```markdown
# Exportación del modelo a ONNX

Paso offline, requiere Python (ver `requirements.txt` de esta carpeta, separado
del backend Node en runtime).

## Uso

\`\`\`bash
cd model-export
python -m venv .venv
source .venv/bin/activate   # o .venv\Scripts\activate en Windows
pip install -r requirements.txt
chmod +x export_to_onnx.sh
./export_to_onnx.sh
\`\`\`

Esto genera `model-export/output/` con (al menos) `model.onnx`, `config.json`
y `preprocessor_config.json`.

## Siguiente paso

Copiar esos 3 archivos a `backend/models/` (ver Task 4, Step 5 del plan de
migración) y trackearlos con Git LFS (`model.onnx` ya está en `.gitattributes`
desde Task 1).
```

- [ ] **Step 4: Ejecutar la exportación**

Run:
```bash
cd model-export
python -m venv .venv
source .venv/Scripts/activate   # Windows Git Bash
pip install -r requirements.txt
chmod +x export_to_onnx.sh
./export_to_onnx.sh
```
Expected: termina sin error y `model-export/output/` contiene `model.onnx`, `config.json`, `preprocessor_config.json` (nombres exactos a confirmar contra el output real de `optimum-cli` — si difieren, ajustar Step 5 en consecuencia y avisar).

**Si este paso falla** (por incompatibilidad de versiones, modelo no soportado por el exportador ONNX de `optimum`, etc.): detente y reporta el error exacto antes de intentar workarounds — no hay fallback silencioso aceptable para el motor de IA.

- [ ] **Step 5: Inspeccionar los archivos generados antes de copiarlos**

Run: `cat model-export/output/preprocessor_config.json`
Anota: `image_mean`, `image_std`, `size` (o `shortest_edge`), `do_normalize`, `do_rescale`, `rescale_factor`, `resample`. Estos valores reales alimentan Task 5 — **no asumir valores estándar de ImageNet** aunque coincidan (documentar lo que diga el archivo real, no lo que se espera).

Run: `cat model-export/output/config.json | grep -A5 id2label`
Anota el mapeo real de labels (ej. si es `{"0": "NORMAL", "1": "PNEUMONIA"}` o al revés) — el pipeline Python actual hace `label.upper() == "PNEUMONIA"`, así que hay que confirmar que el índice 1 (o el que corresponda) realmente mapea a `"PNEUMONIA"` y no al revés.

- [ ] **Step 6: Copiar artefactos a `backend/models/` y trackear con LFS**

```bash
cp model-export/output/model.onnx backend/models/model.onnx
cp model-export/output/config.json backend/models/config.json
cp model-export/output/preprocessor_config.json backend/models/preprocessor_config.json
git add backend/models/model.onnx backend/models/config.json backend/models/preprocessor_config.json
git status
```
Expected: `git status` muestra `model.onnx` marcado para LFS (verificar con `git lfs status`).

- [ ] **Step 7: Commit**

```bash
git add model-export/requirements.txt model-export/export_to_onnx.sh model-export/README.md model-export/test_images backend/models
git commit -m "feat: export ViT chest-xray model to ONNX, track with Git LFS"
```

**⏸ Checkpoint crítico: mostrar Step 5 (valores reales de `preprocessor_config.json` y `id2label`) antes de escribir el código de preprocesamiento — si algo ahí es distinto a lo esperado, el diseño de Task 5/6 puede cambiar.**

---

## Task 5: Preprocesamiento de imagen en TypeScript (equivalente a `ViTImageProcessor`)

**Files:**
- Create: `backend/src/utils/imagePreprocess.ts`
- Test: `backend/src/utils/imagePreprocess.test.ts`

El objetivo es reproducir exactamente lo que hace el `image-classification` pipeline de `transformers` antes de pasar la imagen al modelo: resize → rescale (÷255) → normalize (`(x - mean) / std`) → layout `CHW`.

- [ ] **Step 1: Escribir el test con un caso determinístico (imagen 2x2 sintética, sin decodificar JPEG real, para aislar la lógica matemática de la decodificación)**

```typescript
// backend/src/utils/imagePreprocess.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { preprocessImage, type PreprocessorConfig } from './imagePreprocess.js';

const testConfig: PreprocessorConfig = {
  image_mean: [0.5, 0.5, 0.5],
  image_std: [0.5, 0.5, 0.5],
  size: { height: 2, width: 2 },
  do_normalize: true,
  do_rescale: true,
  rescale_factor: 1 / 255,
};

test('normaliza un pixel blanco puro (255,255,255) a ~1.0 en cada canal', async () => {
  const whitePixelPng = await sharp({
    create: { width: 2, height: 2, channels: 3, background: { r: 255, g: 255, b: 255 } },
  }).png().toBuffer();

  const tensor = await preprocessImage(whitePixelPng, testConfig);

  assert.equal(tensor.length, 3 * 2 * 2);
  for (const value of tensor) {
    assert.ok(Math.abs(value - 1.0) < 1e-4, `esperado ~1.0, obtuvo ${value}`);
  }
});

test('normaliza un pixel negro puro (0,0,0) a ~-1.0 en cada canal', async () => {
  const blackPixelPng = await sharp({
    create: { width: 2, height: 2, channels: 3, background: { r: 0, g: 0, b: 0 } },
  }).png().toBuffer();

  const tensor = await preprocessImage(blackPixelPng, testConfig);
  for (const value of tensor) {
    assert.ok(Math.abs(value - -1.0) < 1e-4, `esperado ~-1.0, obtuvo ${value}`);
  }
});

test('produce layout CHW (no HWC): el plano 0 son todos valores del canal R', async () => {
  const redPixelPng = await sharp({
    create: { width: 2, height: 2, channels: 3, background: { r: 255, g: 0, b: 0 } },
  }).png().toBuffer();

  const tensor = await preprocessImage(redPixelPng, testConfig);
  const plane = 2 * 2;
  const rPlane = tensor.slice(0, plane);
  const gPlane = tensor.slice(plane, plane * 2);

  for (const value of rPlane) assert.ok(Math.abs(value - 1.0) < 1e-4);
  for (const value of gPlane) assert.ok(Math.abs(value - -1.0) < 1e-4);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test`
Expected: FAIL — `Cannot find module './imagePreprocess.js'`.

- [ ] **Step 3: Implementar `backend/src/utils/imagePreprocess.ts`**

```typescript
// backend/src/utils/imagePreprocess.ts
import sharp from 'sharp';

export interface PreprocessorConfig {
  image_mean: number[];
  image_std: number[];
  size: { height: number; width: number } | { shortest_edge: number };
  do_normalize?: boolean;
  do_resize?: boolean;
  do_rescale?: boolean;
  rescale_factor?: number;
}

function resolveTargetSize(size: PreprocessorConfig['size']): { width: number; height: number } {
  if ('shortest_edge' in size) {
    return { width: size.shortest_edge, height: size.shortest_edge };
  }
  return { width: size.width, height: size.height };
}

export async function preprocessImage(
  imageBuffer: Buffer,
  config: PreprocessorConfig,
): Promise<Float32Array> {
  const { width, height } = resolveTargetSize(config.size);

  const { data, info } = await sharp(imageBuffer)
    .resize(width, height, { fit: 'fill', kernel: sharp.kernel.cubic })
    .removeAlpha()
    .toColorspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.channels !== 3) {
    throw new Error(`Se esperaban 3 canales (RGB), se obtuvieron ${info.channels}`);
  }

  const doRescale = config.do_rescale ?? true;
  const rescaleFactor = config.rescale_factor ?? 1 / 255;
  const doNormalize = config.do_normalize ?? true;
  const { image_mean: mean, image_std: std } = config;

  const plane = width * height;
  const chw = new Float32Array(3 * plane);

  for (let pixelIndex = 0; pixelIndex < plane; pixelIndex++) {
    for (let channel = 0; channel < 3; channel++) {
      let value = data[pixelIndex * 3 + channel] as number;
      if (doRescale) value = value * rescaleFactor;
      if (doNormalize) value = (value - mean[channel]) / std[channel];
      chw[channel * plane + pixelIndex] = value;
    }
  }

  return chw;
}
```

- [ ] **Step 4: Correr el test de nuevo**

Run: `npm test`
Expected: PASS (todos los tests de `imagePreprocess.test.ts`).

Nota de riesgo conocida: HF `ViTImageProcessor` usa por default resample `BICUBIC` (PIL). `sharp.kernel.cubic` es el equivalente más cercano disponible en `sharp`, pero no es matemáticamente idéntico a la implementación de PIL. Si la validación de Task 7 muestra discrepancias de confianza mayores al margen acordado (1%), este es el primer sospechoso — probar otros kernels (`sharp.kernel.lanczos3`) y documentar cuál da menor discrepancia.

- [ ] **Step 5: Typecheck y commit**

```bash
npm run typecheck
git add backend/src/utils
git commit -m "feat: implement image preprocessing matching ViTImageProcessor"
```

**⏸ Checkpoint: mostrar Task 5 antes de continuar con Task 6 (inferencia ONNX).**

---

## Task 6: Servicio de inferencia ONNX

**Files:**
- Create: `backend/src/services/inferenceService.ts`
- Test: `backend/src/services/inferenceService.test.ts`

Este servicio carga `backend/models/model.onnx` una vez al iniciar, expone una función para correr inferencia sobre un tensor preprocesado, aplica softmax y mapea el resultado a labels usando `backend/models/config.json` (`id2label`) — igual que hace `transformers.pipeline` internamente.

- [ ] **Step 1: Inspeccionar nombres reales de input/output del modelo exportado (no asumir "pixel_values"/"logits")**

Run:
```bash
node -e "
const ort = require('onnxruntime-node');
(async () => {
  const session = await ort.InferenceSession.create('backend/models/model.onnx');
  console.log('inputs:', session.inputNames);
  console.log('outputs:', session.outputNames);
})();
"
```
Anota los nombres reales — se usan en el Step 3. Si difieren de `pixel_values`/`logits`, ajustar el código del Step 3 en consecuencia antes de continuar.

- [ ] **Step 2: Escribir el test de softmax + mapeo de labels (unitario, sin cargar el modelo real, para aislar la lógica de postprocesamiento)**

```typescript
// backend/src/services/inferenceService.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { softmax, mapLogitsToPrediction } from './inferenceService.js';

test('softmax suma 1.0 y preserva el orden relativo', () => {
  const result = softmax(new Float32Array([1, 2, 3]));
  const sum = result.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1.0) < 1e-6);
  assert.ok(result[2] > result[1] && result[1] > result[0]);
});

test('mapLogitsToPrediction elige el label de mayor probabilidad', () => {
  const id2label: Record<string, string> = { '0': 'NORMAL', '1': 'PNEUMONIA' };
  const prediction = mapLogitsToPrediction(new Float32Array([0.1, 4.5]), id2label);
  assert.equal(prediction.label, 'PNEUMONIA');
  assert.ok(prediction.confidence > 0.9);
});

test('mapLogitsToPrediction funciona igual si NORMAL tiene el logit mayor', () => {
  const id2label: Record<string, string> = { '0': 'NORMAL', '1': 'PNEUMONIA' };
  const prediction = mapLogitsToPrediction(new Float32Array([5.0, 0.2]), id2label);
  assert.equal(prediction.label, 'NORMAL');
});
```

- [ ] **Step 3: Correr el test y verificar que falla**

Run: `npm test`
Expected: FAIL — `Cannot find module './inferenceService.js'`.

- [ ] **Step 4: Implementar `backend/src/services/inferenceService.ts`**

(Los nombres de tensor `INPUT_NAME`/`OUTPUT_NAME` deben reemplazarse por los valores reales anotados en el Step 1 si difieren de `pixel_values`/`logits`.)

```typescript
// backend/src/services/inferenceService.ts
import * as ort from 'onnxruntime-node';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';
import { preprocessImage, type PreprocessorConfig } from '../utils/imagePreprocess.js';

const INPUT_NAME = 'pixel_values';
const OUTPUT_NAME = 'logits';

export function softmax(logits: Float32Array): Float32Array {
  const max = Math.max(...logits);
  const exps = Float32Array.from(logits, (value) => Math.exp(value - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return Float32Array.from(exps, (value) => value / sum);
}

export interface Prediction {
  label: string;
  confidence: number;
}

export function mapLogitsToPrediction(
  logits: Float32Array,
  id2label: Record<string, string>,
): Prediction {
  const probabilities = softmax(logits);
  let bestIndex = 0;
  for (let i = 1; i < probabilities.length; i++) {
    if (probabilities[i] > probabilities[bestIndex]) bestIndex = i;
  }
  return {
    label: id2label[String(bestIndex)].toUpperCase(),
    confidence: probabilities[bestIndex],
  };
}

let session: ort.InferenceSession | null = null;
let preprocessorConfig: PreprocessorConfig | null = null;
let id2label: Record<string, string> | null = null;

export function isModelReady(): boolean {
  return session !== null;
}

export async function loadModel(): Promise<void> {
  const modelPath = path.join(env.MODEL_DIR, 'model.onnx');
  const preprocessorConfigPath = path.join(env.MODEL_DIR, 'preprocessor_config.json');
  const modelConfigPath = path.join(env.MODEL_DIR, 'config.json');

  session = await ort.InferenceSession.create(modelPath);
  preprocessorConfig = JSON.parse(await readFile(preprocessorConfigPath, 'utf-8'));
  const modelConfig = JSON.parse(await readFile(modelConfigPath, 'utf-8'));
  id2label = modelConfig.id2label;
}

export async function runInference(imageBuffer: Buffer): Promise<Prediction> {
  if (!session || !preprocessorConfig || !id2label) {
    throw new Error('El modelo no está cargado. Llama a loadModel() antes de runInference().');
  }

  const chwTensor = await preprocessImage(imageBuffer, preprocessorConfig);
  const { height, width } = 'height' in preprocessorConfig.size
    ? preprocessorConfig.size
    : { height: preprocessorConfig.size.shortest_edge, width: preprocessorConfig.size.shortest_edge };

  const feeds: Record<string, ort.Tensor> = {
    [INPUT_NAME]: new ort.Tensor('float32', chwTensor, [1, 3, height, width]),
  };

  const results = await session.run(feeds);
  const logits = results[OUTPUT_NAME].data as Float32Array;

  return mapLogitsToPrediction(logits, id2label);
}
```

- [ ] **Step 5: Correr el test de nuevo**

Run: `npm test`
Expected: PASS (los 3 tests de `inferenceService.test.ts`, más los tests previos siguen pasando).

- [ ] **Step 6: Test de integración manual con el modelo real (no automatizado — se hace una vez para confirmar que el pipeline completo carga y corre)**

Run (desde la raíz del repo):
```bash
node --import tsx -e "
import { loadModel, runInference } from './backend/src/services/inferenceService.ts';
import { readFile } from 'node:fs/promises';
(async () => {
  await loadModel();
  const buffer = await readFile('model-export/test_images/sample_pneumonia.jpg');
  console.log(await runInference(buffer));
})();
"
```
Expected: imprime `{ label: 'PNEUMONIA' o 'NORMAL', confidence: <número entre 0 y 1> }` sin errores. Si tira error de shape/tensor, revisar los nombres de input/output del Step 1 y el `size` del `preprocessor_config.json`.

- [ ] **Step 7: Typecheck y commit**

```bash
npm run typecheck
git add backend/src/services
git commit -m "feat: implement ONNX inference service with softmax and label mapping"
```

**⏸ Checkpoint: mostrar el resultado del Step 6 (inferencia real corriendo) antes de continuar con Task 7 (validación de equivalencia formal).**

---

## Task 7: Validación de equivalencia Python vs Node (gate obligatorio)

**Files:**
- Create: `model-export/validate_equivalence.py`
- Create: `model-export/compare_with_node.mjs`

**Este task es un gate: si hay discrepancias de etiqueta o de confianza > 1%, NO se continúa a Task 8. Se reporta al usuario y se espera instrucción.**

- [ ] **Step 1: Crear `model-export/validate_equivalence.py` — corre el pipeline Python original sobre las imágenes de prueba**

```python
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
```

- [ ] **Step 2: Correr el baseline Python**

Run:
```bash
cd model-export
source .venv/Scripts/activate
python validate_equivalence.py
```
Expected: imprime una predicción por imagen en `test_images/` y genera `model-export/python_baseline_results.json`.

- [ ] **Step 3: Crear `model-export/compare_with_node.mjs` — corre el pipeline Node ONNX sobre las mismas imágenes y compara**

```javascript
// model-export/compare_with_node.mjs
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { loadModel, runInference } from '../backend/src/services/inferenceService.ts';

const TEST_IMAGES_DIR = path.join(import.meta.dirname, 'test_images');
const BASELINE_PATH = path.join(import.meta.dirname, 'python_baseline_results.json');
const CONFIDENCE_TOLERANCE = 0.01;

async function main() {
  await loadModel();
  const baseline = JSON.parse(await readFile(BASELINE_PATH, 'utf-8'));
  const imageFiles = (await readdir(TEST_IMAGES_DIR)).filter((f) => f.endsWith('.jpg'));

  let hasMismatch = false;

  for (const fileName of imageFiles) {
    const buffer = await readFile(path.join(TEST_IMAGES_DIR, fileName));
    const nodeResult = await runInference(buffer);
    const pythonResult = baseline[fileName];

    const labelMatch = nodeResult.label === pythonResult.label;
    const confidenceDiff = Math.abs(nodeResult.confidence - pythonResult.confidence);
    const confidenceMatch = confidenceDiff <= CONFIDENCE_TOLERANCE;

    const status = labelMatch && confidenceMatch ? 'OK' : 'MISMATCH';
    if (status === 'MISMATCH') hasMismatch = true;

    console.log(
      `[${status}] ${fileName} — Python: ${pythonResult.label} (${pythonResult.confidence.toFixed(4)}) | ` +
      `Node: ${nodeResult.label} (${nodeResult.confidence.toFixed(4)}) | diff: ${confidenceDiff.toFixed(4)}`,
    );
  }

  if (hasMismatch) {
    console.error('\n❌ Hay discrepancias por encima de la tolerancia (1%) o cambios de etiqueta.');
    process.exit(1);
  }
  console.log('\n✅ Equivalencia confirmada dentro de la tolerancia.');
}

main();
```

- [ ] **Step 4: Correr la comparación**

Run: `node --import tsx model-export/compare_with_node.mjs`
Expected: una línea `[OK]` por imagen y el mensaje final `✅ Equivalencia confirmada dentro de la tolerancia.`

- [ ] **Step 5: Reportar resultados al usuario tal cual (no resumir como "funciona")**

Pegar la salida completa de los Steps 2 y 4 (por imagen: label y confidence de ambos pipelines, y el diff) en el mensaje al usuario. Si hubo `MISMATCH` en cualquier imagen, **detenerse aquí, no tocar Task 8**, y reportar exactamente qué imagen(es) fallaron y por cuánto margen — dejar que el usuario decida (ej. ajustar tolerancia, investigar el kernel de resize de `sharp`, revisar `id2label`).

- [ ] **Step 6: Si todo pasó, commit**

```bash
git add model-export/validate_equivalence.py model-export/compare_with_node.mjs model-export/python_baseline_results.json
git commit -m "test: validate ONNX/Node inference equivalence against Python baseline"
```

**⏸ Checkpoint obligatorio: este resultado se muestra completo al usuario. No se avanza a Task 8 sin aprobación explícita, incluso si todo pasó.**

---

## Task 8: App Express — schemas, middlewares, routes, controllers, services

**Files:**
- Create: `backend/src/schemas/analyze.schemas.ts`
- Create: `backend/src/middlewares/modelReady.ts`
- Create: `backend/src/middlewares/errorHandler.ts`
- Create: `backend/src/middlewares/upload.ts`
- Create: `backend/src/services/analysisService.ts`
- Create: `backend/src/controllers/analyze.controller.ts`
- Create: `backend/src/routes/analyze.routes.ts`
- Modify: `backend/src/server.ts`
- Test: `backend/src/services/analysisService.test.ts`
- Test: `backend/src/middlewares/errorHandler.test.ts`

**Decisión de contrato (resuelve la asimetría encontrada en Fase 1):** ambos endpoints devuelven la misma forma de respuesta, incluyendo `saved_path`. Para `GET /api/analyze-sample` (imágenes de galería que no se suben), `saved_path` es `null` — no hay archivo nuevo que referenciar, así que forzar un string sería engañoso. Esto se documenta en el schema Zod con un comentario.

- [ ] **Step 1: Escribir el schema Zod (única fuente de verdad para request/response)**

```typescript
// backend/src/schemas/analyze.schemas.ts
import { z } from 'zod';

export const analyzeSampleQuerySchema = z.object({
  image_name: z.string().min(1, 'image_name es requerido'),
});

export const analysisResultSchema = z.object({
  anomaly_detected: z.boolean(),
  disease: z.string(),
  confidence: z.number().min(0).max(1),
  zones: z.array(z.string()),
  // null cuando no se guardó un archivo nuevo (ej. análisis de muestra de galería)
  saved_path: z.string().nullable(),
});

export type AnalyzeSampleQuery = z.infer<typeof analyzeSampleQuerySchema>;
export type AnalysisResult = z.infer<typeof analysisResultSchema>;
```

- [ ] **Step 2: Escribir el test de `analysisService` (heurística de keywords + delegación a inferencia real)**

```typescript
// backend/src/services/analysisService.test.ts
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeByFilenameHeuristic } from './analysisService.js';

test('detecta "fibrosis" en el nombre de archivo y devuelve el diagnóstico hardcodeado', () => {
  const result = analyzeByFilenameHeuristic('rx_fibrosis_paciente.jpg');
  assert.ok(result);
  assert.equal(result?.disease, 'Posible Fibrosis Pulmonar');
  assert.equal(result?.confidence, 0.94);
});

test('detecta "cardiomegalia" o "corazon"', () => {
  assert.equal(analyzeByFilenameHeuristic('corazon_grande.jpg')?.disease, 'Posible Cardiomegalia');
  assert.equal(analyzeByFilenameHeuristic('cardiomegalia.png')?.disease, 'Posible Cardiomegalia');
});

test('detecta "tuberculosis" o "tb"', () => {
  assert.equal(analyzeByFilenameHeuristic('caso_tb.jpg')?.disease, 'Posible Tuberculosis');
});

test('detecta "nodulo", "masa" o "tumor"', () => {
  assert.equal(analyzeByFilenameHeuristic('nodulo_1.jpg')?.disease, 'Nódulo / Masa Pulmonar');
  assert.equal(analyzeByFilenameHeuristic('masa_sospechosa.jpg')?.disease, 'Nódulo / Masa Pulmonar');
  assert.equal(analyzeByFilenameHeuristic('posible_tumor.jpg')?.disease, 'Nódulo / Masa Pulmonar');
});

test('devuelve null si no hay palabra clave (debe ejecutarse la inferencia real)', () => {
  assert.equal(analyzeByFilenameHeuristic('radiografia_paciente_123.jpg'), null);
});
```

- [ ] **Step 3: Correr el test y verificar que falla**

Run: `npm test`
Expected: FAIL — `Cannot find module './analysisService.js'`.

- [ ] **Step 4: Implementar `backend/src/services/analysisService.ts`**

Mantiene el atajo por nombre de archivo tal cual pidió el usuario (no se elimina).

**Por qué esto es mala práctica (para que quede documentado, no se actúa sobre esto ahora):** el resultado depende del *nombre* del archivo que sube el usuario, no de su contenido — cualquiera puede forzar cualquier diagnóstico con solo renombrar la imagen antes de subirla, incluso una imagen que no sea una radiografía. Además, si el modelo real mejora o se re-entrena, estos 4 casos seguirán devolviendo confianzas fijas (0.94/0.91/0.97/0.88) que nunca reflejan al modelo actual, lo cual puede ocultar regresiones durante demos. Es aceptable como atajo de demostración controlado, pero no debería activarse con datos de pacientes reales sin dejarlo muy explícito en la UI.

```typescript
// backend/src/services/analysisService.ts
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { env } from '../config/env.js';
import { runInference } from './inferenceService.js';
import type { AnalysisResult } from '../schemas/analyze.schemas.js';

interface HeuristicResult {
  disease: string;
  confidence: number;
  zones: string[];
}

// Atajo de demo: si el NOMBRE del archivo contiene una palabra clave, se devuelve
// un diagnóstico fijo sin correr el modelo. Mantenido igual al comportamiento
// original de main.py por instrucción explícita del usuario (no se decide eliminar).
export function analyzeByFilenameHeuristic(originalFilename: string): HeuristicResult | null {
  const name = originalFilename.toLowerCase();

  if (name.includes('fibrosis')) {
    return {
      disease: 'Posible Fibrosis Pulmonar',
      confidence: 0.94,
      zones: ['Análisis de Patrón Reticular (ViT + Heurística)'],
    };
  }
  if (name.includes('cardiomegalia') || name.includes('corazon')) {
    return {
      disease: 'Posible Cardiomegalia',
      confidence: 0.91,
      zones: ['Análisis de Silueta Cardíaca (ViT + Heurística)'],
    };
  }
  if (name.includes('tuberculosis') || name.includes('tb')) {
    return {
      disease: 'Posible Tuberculosis',
      confidence: 0.97,
      zones: ['Análisis de Cavitaciones (ViT + Heurística)'],
    };
  }
  if (name.includes('nodulo') || name.includes('masa') || name.includes('tumor')) {
    return {
      disease: 'Nódulo / Masa Pulmonar',
      confidence: 0.88,
      zones: ['Detección de Masas (ViT + Heurística)'],
    };
  }
  return null;
}

export async function analyzeUploadedImage(
  buffer: Buffer,
  originalFilename: string,
): Promise<AnalysisResult> {
  const savedFilename = `upload_${randomUUID().slice(0, 8)}.jpg`;
  const savedPath = path.join(env.UPLOADS_DIR, savedFilename);
  await writeFile(savedPath, buffer);

  const heuristic = analyzeByFilenameHeuristic(originalFilename);
  if (heuristic) {
    return {
      anomaly_detected: true,
      disease: heuristic.disease,
      confidence: heuristic.confidence,
      zones: heuristic.zones,
      saved_path: savedPath,
    };
  }

  const prediction = await runInference(buffer);
  const anomalyDetected = prediction.label === 'PNEUMONIA';

  return {
    anomaly_detected: anomalyDetected,
    disease: anomalyDetected ? 'Infiltrado pulmonar / Posible Neumonía' : 'Pulmones Sanos',
    confidence: prediction.confidence,
    zones: anomalyDetected ? ['Análisis global (ViT)'] : [],
    saved_path: savedPath,
  };
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

- [ ] **Step 5: Correr el test de nuevo**

Run: `npm test`
Expected: PASS (5/5 tests de `analysisService.test.ts`).

- [ ] **Step 6: Middleware `modelReady` — corrige el bug de Fase 1 (200 con `{error}` → 503 real)**

```typescript
// backend/src/middlewares/modelReady.ts
import type { Request, Response, NextFunction } from 'express';
import { isModelReady } from '../services/inferenceService.js';

export function modelReady(req: Request, res: Response, next: NextFunction): void {
  if (!isModelReady()) {
    res.status(503).json({ error: 'El modelo de IA no está disponible todavía.' });
    return;
  }
  next();
}
```

- [ ] **Step 7: Middleware de manejo centralizado de errores — test primero**

```typescript
// backend/src/middlewares/errorHandler.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { errorHandler } from './errorHandler.js';

function createMockResponse() {
  const res: any = {};
  res.statusCode = 200;
  res.body = null;
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (payload: unknown) => { res.body = payload; return res; };
  return res;
}

test('responde 500 con mensaje genérico para errores no controlados', () => {
  const res = createMockResponse();
  errorHandler(new Error('boom interno'), {} as any, res, (() => {}) as any);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Error interno del servidor.' });
});
```

- [ ] **Step 8: Correr el test y verificar que falla**

Run: `npm test`
Expected: FAIL — `Cannot find module './errorHandler.js'`.

- [ ] **Step 9: Implementar `backend/src/middlewares/errorHandler.ts`**

```typescript
// backend/src/middlewares/errorHandler.ts
import type { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Error interno del servidor.' });
}
```

- [ ] **Step 10: Correr el test de nuevo**

Run: `npm test`
Expected: PASS.

- [ ] **Step 11: Middleware de upload (multer) con validación real de tamaño y MIME**

```typescript
// backend/src/middlewares/upload.ts
import multer from 'multer';
import { env } from '../config/env.js';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      callback(new Error(`Tipo de archivo no permitido: ${file.mimetype}`));
      return;
    }
    callback(null, true);
  },
});
```

- [ ] **Step 12: Controller**

```typescript
// backend/src/controllers/analyze.controller.ts
import type { Request, Response, NextFunction } from 'express';
import { analyzeUploadedImage, analyzeSampleImage } from '../services/analysisService.js';
import { analyzeSampleQuerySchema } from '../schemas/analyze.schemas.js';

export async function postAnalyzeUpload(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Falta el archivo "file" en el form-data.' });
      return;
    }
    const result = await analyzeUploadedImage(req.file.buffer, req.file.originalname);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export function getAnalyzeSample(req: Request, res: Response, next: NextFunction) {
  try {
    const query = analyzeSampleQuerySchema.parse(req.query);
    const result = analyzeSampleImage(query.image_name);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
```

- [ ] **Step 13: Routes**

```typescript
// backend/src/routes/analyze.routes.ts
import { Router } from 'express';
import { modelReady } from '../middlewares/modelReady.js';
import { upload } from '../middlewares/upload.js';
import { postAnalyzeUpload, getAnalyzeSample } from '../controllers/analyze.controller.js';

export const analyzeRouter = Router();

analyzeRouter.post('/analyze-upload', modelReady, upload.single('file'), postAnalyzeUpload);
analyzeRouter.get('/analyze-sample', getAnalyzeSample);
```

Nota: `GET /analyze-sample` no pasa por `modelReady` porque no usa el modelo real (es la simulación de galería) — igual que en el `main.py` original.

- [ ] **Step 14: `server.ts` final (reemplaza el placeholder de Task 2)**

```typescript
// backend/src/server.ts
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { analyzeRouter } from './routes/analyze.routes.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { loadModel } from './services/inferenceService.js';

async function main() {
  const app = express();

  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json());
  app.use('/api', analyzeRouter);
  app.use(errorHandler);

  console.log('Cargando modelo de Inteligencia Artificial (ONNX)...');
  try {
    await loadModel();
    console.log('¡Modelo ONNX cargado exitosamente!');
  } catch (err) {
    console.error('Error al cargar el modelo:', err);
  }

  app.listen(env.PORT, '0.0.0.0', () => {
    console.log(`API ejecutándose y escuchando en todas las interfaces: http://0.0.0.0:${env.PORT}`);
  });
}

main();
```

- [ ] **Step 15: Typecheck, correr todos los tests, y prueba manual end-to-end**

```bash
npm run typecheck
npm test
npm run dev
```
En otra terminal:
```bash
curl "http://127.0.0.1:8000/api/analyze-sample?image_name=sample_pneumonia.jpg"
curl -F "file=@../model-export/test_images/sample_normal.jpg" http://127.0.0.1:8000/api/analyze-upload
```
Expected: ambos devuelven JSON 200 con la forma de `AnalysisResult`; el segundo además crea un archivo nuevo en `backend/uploads/`.

- [ ] **Step 16: Commit**

```bash
git add backend/src
git commit -m "feat: implement Express routes/controllers/services with unified response contract"
```

**⏸ Checkpoint: mostrar Task 8 completo (incluida la prueba manual con curl) antes de continuar con Task 9 (frontend).**

---

## Task 9: Fix del frontend (`API_BASE_URL` configurable + manejo real de errores)

**Files:**
- Modify: `frontend/app.js:1-3`
- Modify: `frontend/app.js` (función `startScan`, líneas ~95-141 del archivo original)

- [ ] **Step 1: Hacer `API_BASE_URL` configurable sin build step**

Reemplazar las líneas 1-3 de `frontend/app.js`:

```javascript
// --- CONFIGURACIÓN DE API ---
// Para apuntar a otra IP (demo en red local), cambia el valor en localStorage:
//   localStorage.setItem('API_BASE_URL', 'http://192.168.1.15:8000')
// o edita el valor por defecto de abajo.
const API_BASE_URL = localStorage.getItem('API_BASE_URL') || "http://127.0.0.1:8000";
```

- [ ] **Step 2: Corregir el manejo de errores en `startScan()` — revisar `response.ok` y el campo `error` antes de asumir éxito**

Reemplazar el bloque `try { ... } catch (error) { ... }` dentro de `startScan()`:

```javascript
    try {
        let response;
        if (currentFile) {
            const formData = new FormData();
            formData.append('file', currentFile);
            response = await fetch(`${API_BASE_URL}/api/analyze-upload`, {
                method: 'POST',
                body: formData
            });
        } else {
            const imageName = currentImageSrc.split('/').pop();
            response = await fetch(`${API_BASE_URL}/api/analyze-sample?image_name=${imageName}`);
        }

        const data = await response.json();

        if (!response.ok || data.error) {
            throw new Error(data.error || `Error del servidor (status ${response.status})`);
        }

        const elapsed = performance.now() - startTime;
        if (elapsed < 2500) await new Promise(r => setTimeout(r, 2500 - elapsed));

        showResults(data, performance.now() - startTime);

    } catch (error) {
        console.error('Error:', error);
        statusSpinner.classList.remove('active');
        statusIconDone.style.display = 'none';
        statusTitle.innerText = 'Error de análisis';
        statusDesc.innerText = error.message || 'No se pudo contactar al motor de IA';
        verdictBadge.className = 'badge danger';
        verdictBadge.innerText = 'Error';
        verdictTitle.innerText = 'No se pudo completar el análisis';
        infoText.innerText = 'Revisa la conexión con el servidor o intenta con otra imagen.';
        btnScan.disabled = false;
        viewerContainer.classList.remove('scanning');
    }
```

Antes este `catch` solo se activaba si `fetch` fallaba a nivel de red (servidor caído). Ahora también captura: (a) el backend respondiendo 503 (`modelReady` middleware), 400 (validación) o 500 (error inesperado), y (b) cualquier `{ error: ... }` en el body — ya no cae silenciosamente en "Pulmones Sanos".

- [ ] **Step 3: Prueba manual en navegador**

1. Levantar el backend (`npm run dev` en `backend/`).
2. Abrir `frontend/index.html` directamente en el navegador.
3. Caso feliz: subir `model-export/test_images/sample_normal.jpg` → debe mostrar resultado normal.
4. Caso error: detener el backend (`Ctrl+C`) y volver a intentar un análisis → debe mostrar el estado "Error de análisis" en la UI, no "Pulmones Sanos".
5. Caso 503: reiniciar el backend pero interceptar el `fetch` (o simular) para confirmar que un 503 real también muestra el estado de error — si no es práctico simular el 503 manualmente, dejarlo documentado como pendiente de verificación visual y decírselo al usuario.

- [ ] **Step 4: Commit**

```bash
git add frontend/app.js
git commit -m "fix: configurable API_BASE_URL and real error handling in frontend"
```

**⏸ Checkpoint: mostrar Task 9 (incluida evidencia de la prueba manual en navegador, screenshot si es posible) antes de continuar con Task 10.**

---

## Task 10: Limpieza final y documentación

**Files:**
- Modify: `README.md`
- Modify: `GUIA_EJECUCION.md`
- Delete (ya migrado en Task 1, verificar que no queden restos): `backend/samples/` (no debería existir; confirmar)

- [ ] **Step 1: Actualizar `README.md`** — reflejar el nuevo stack (Node/Express/TypeScript backend, ONNX local, `legacy-python-backend/` archivado) y el nuevo árbol de carpetas real.

- [ ] **Step 2: Actualizar `GUIA_EJECUCION.md`** — reemplazar `uvicorn main:app --reload` por `npm run dev` (desde `backend/`), y la sección de "cambiar la IP" por la nueva vía de `localStorage.setItem('API_BASE_URL', ...)`.

- [ ] **Step 3: Verificación final de que no quedó nada huérfano**

Run: `find backend -maxdepth 2 -not -path '*/node_modules/*'`
Expected: solo aparecen `src/`, `models/`, `uploads/`, `package.json`, `package-lock.json`, `tsconfig.json`, `.gitignore`, `.env.example` — nada de `main.py` ni `requirements.txt` sueltos en `backend/`.

- [ ] **Step 4: Commit final**

```bash
git add README.md GUIA_EJECUCION.md
git commit -m "docs: update README and execution guide for Node/Express backend"
```

**⏸ Checkpoint final: mostrar el diff completo de README/GUIA_EJECUCION y pedir aprobación de cierre de la migración.**
