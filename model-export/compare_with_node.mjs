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
