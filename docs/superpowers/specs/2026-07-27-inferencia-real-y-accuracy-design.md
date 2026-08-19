# Diagnóstico real (sin heurística) + validación de accuracy — Design

**Fecha:** 2026-07-27
**Estado:** Aprobado por el usuario (ver decisiones abajo), pendiente de plan de implementación.

## Contexto

El aplicativo (Node/Express + ONNX, rama `feature/node-express-migration`, ya migrado y mergeable) tiene un modelo real (ViT, `nickmuchi/vit-finetuned-chest-xray-pneumonia`, binario: NORMAL/PNEUMONIA) pero **no siempre lo usa**: `analysisService.ts` corre primero una heurística por nombre de archivo (`analyzeByFilenameHeuristic`) que devuelve diagnósticos fijos e inventados (fibrosis 94%, cardiomegalia 91%, tuberculosis 97%, nódulo 88%) sin ejecutar el modelo, si el nombre del archivo subido contiene ciertas palabras clave. Esto fue un "atajo de demo" intencional documentado en el código y en `GUIA_EJECUCION.md`.

Además, la única validación existente del modelo real es un *gate de equivalencia de migración* (Python↔Node, n=2 imágenes, tolerancia 1pp) que confirma que Node reproduce fielmente lo que hace Python — pero **no** que el modelo diagnostique bien. Prueba en vivo (2026-07-27) confirmó que tanto el baseline Python como Node clasifican `sample_normal.jpg` (paciente sano) como PNEUMONIA con 61.5%/62% de confianza — un falso positivo real del modelo, no un bug de migración.

## Objetivo

1. Que **toda imagen subida** al escáner pase siempre por el modelo real de IA — eliminar el atajo por nombre de archivo del flujo de subida.
2. Que la confianza reportada corresponda a un modelo cuya precisión fue **medida con evidencia propia** (accuracy/precision/recall/F1 sobre un dataset de test real), no solo confianza de un caso suelto ni cifras publicadas de terceros sin verificar.

## Fuera de alcance

- La galería de pacientes predefinidos (`analyzeSampleImage`, endpoint `GET /api/analyze-sample`) — sigue usando heurística por nombre + confianza aleatoria. No se toca en este proyecto.
- El "Asistente IA" (chat simulado, `frontend/app.js`) y su hallazgo de self-XSS ya documentado — fuera de alcance, preexistente en `main`.
- Diagnóstico multiclase real (fibrosis, cardiomegalia, tuberculosis, nódulo) — el usuario decidió explícitamente **no** perseguir esto; el modelo se mantiene binario (NORMAL/PNEUMONIA).

## Decisiones del usuario (2026-07-27)

- **Alcance diagnóstico:** binario real, sin multiclase. Se elimina la heurística del flujo de subida.
- **"Elevar confianza" significa:** mejorar precisión real del sistema (investigar causa raíz, medir con dataset de test), no recalibrar ni inflar el número mostrado artificialmente.
- **Cambio de modelo:** el usuario está abierto a reemplazar `nickmuchi/vit-finetuned-chest-xray-pneumonia` por otro modelo preentrenado si se mide (no solo se cita) mejor desempeño.
- **Dataset de test:** se autoriza descargar un dataset público de test etiquetado (candidato: "Chest X-Ray Images Pneumonia", ~624 imágenes de test, 234 NORMAL/390 PNEUMONIA). Se pedirá confirmación explícita de descarga (nombre/fuente/tamaño exactos) antes de bajarlo, en el momento de ejecutar ese paso.
- **Plazo:** sin fecha límite urgente — se prioriza hacerlo bien sobre hacerlo rápido.
- **Criterio de selección de modelo:** priorizar recall/sensibilidad en la clase PNEUMONIA sobre precisión pura (es una herramienta de screening; un falso negativo clínico es peor que una falsa alarma), salvo que el usuario indique otro criterio al ver los números.

## Flujo end-to-end

```
[Dataset de test etiquetado]
        │
        ▼
[Arnés de evaluación Python] ──mide──▶ [Métricas modelo ACTUAL: accuracy, recall, precision, F1, matriz de confusión]
        │
        ▼ (si el desempeño es insuficiente)
[Benchmark de 2-3 modelos candidatos, mismo dataset, mismas métricas]
        │
        ▼
[Selección del mejor modelo con evidencia propia]
        │
        ▼
[Re-exportar a ONNX] ──▶ [Gate de equivalencia Python↔Node existente, re-corrido para el modelo elegido]
        │
        ▼
[Reemplazar backend/models/*] + [Quitar heurística de analysisService.ts para uploads]
        │
        ▼
[Actualizar frontend/docs/tests] ──▶ [Re-validar en vivo (API + UI)]
```

## Componentes a modificar/crear

- **Nuevo:** `model-export/evaluate_accuracy.py` — arnés de evaluación reutilizable (mismo patrón que `validate_equivalence.py`), corre el modelo (actual y cualquier candidato) contra el dataset de test y calcula accuracy/precision/recall/F1/matriz de confusión.
- **Nuevo:** `model-export/accuracy_results.json` — resultados persistidos (análogo a `python_baseline_results.json`), incluye qué modelo se evaluó, fecha, y las métricas completas.
- **Si cambia el modelo ganador:** reemplazar `backend/models/model.onnx`, `config.json`, `preprocessor_config.json`. Posible ajuste de `imagePreprocess.ts`/`inferenceService.ts` si el nuevo modelo requiere preprocesamiento distinto (resample, tamaño, normalización) — se re-corre el gate de equivalencia existente (`model-export/compare_with_node.mjs`) contra el modelo nuevo antes de aceptarlo.
- **`backend/src/services/analysisService.ts`:** eliminar la llamada a `analyzeByFilenameHeuristic` dentro de `analyzeUploadedImage`; `analyzeByFilenameHeuristic` se elimina del archivo (código muerto) salvo que quede usada en otro lugar (verificar antes de borrar).
- **Tests:** actualizar `analysisService.test.ts` — quitar tests que cubren la heurística de upload, añadir test(s) que confirmen que un archivo nombrado con una palabra clave (ej. `fibrosis.jpg`) ahora ejecuta inferencia real en vez de devolver el diagnóstico fijo anterior.
- **Docs:** `GUIA_EJECUCION.md` — quitar el tip de "usa palabras clave en el nombre del archivo para la demo multiclase" (ya no aplica). `README.md` — agregar sección de métricas de accuracy real (matriz de confusión, recall/precision/F1) del modelo final.

## Manejo de errores / casos límite

- Si ningún modelo candidato supera claramente al actual: se reporta al usuario con los números medidos; decide entre mantener el modelo actual (documentando sus límites honestamente) o pasar a fine-tuning propio (fuera de este plan, sería un proyecto siguiente).
- Si el dataset de test no es descargable sin autenticación (Kaggle requiere API key): buscar fuente alternativa (HuggingFace Datasets Hub) antes de continuar; si ninguna fuente es accesible sin credenciales, reportar al usuario antes de improvisar con un dataset más pequeño/no representativo.
- La validación de imagen real (`sharp(buffer).metadata()` antes de heurística/inferencia, commit `0992b38`) se mantiene intacta — sigue protegiendo contra archivos no-imagen renombrados con extensión `.jpg`.
- Si se reemplaza el modelo, el modelo anterior (`nickmuchi`) y sus resultados de evaluación quedan documentados en `accuracy_results.json` como referencia histórica, no se borran silenciosamente.

## Testing / validación final

Repetir la validación en vivo ya hecha hoy (API directa vía curl + UI vía Playwright, subiendo `sample_normal.jpg`, `sample_pneumonia.jpg`, y un archivo no-imagen renombrado) contra el modelo final, más el reporte de métricas del arnés de evaluación (`accuracy_results.json`) como evidencia cuantitativa adicional sobre un conjunto de test real, no solo 2 imágenes.
