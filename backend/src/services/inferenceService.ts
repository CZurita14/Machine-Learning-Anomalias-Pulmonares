import * as ort from 'onnxruntime-node';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';
import { preprocessImage, type PreprocessorConfig } from '../utils/imagePreprocess.js';

// Nombres reales verificados contra backend/models/model.onnx (Step 1):
// inputs: ['pixel_values'], outputs: ['logits'] — coinciden con la suposición del brief.
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
    if (probabilities[i]! > probabilities[bestIndex]!) bestIndex = i;
  }
  return {
    label: id2label[String(bestIndex)]!.toUpperCase(),
    confidence: probabilities[bestIndex]!,
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
  const { height, width } =
    'height' in preprocessorConfig.size
      ? preprocessorConfig.size
      : { height: preprocessorConfig.size.shortest_edge, width: preprocessorConfig.size.shortest_edge };

  const feeds: Record<string, ort.Tensor> = {
    [INPUT_NAME]: new ort.Tensor('float32', chwTensor, [1, 3, height, width]),
  };

  const results = await session.run(feeds);
  const logits = results[OUTPUT_NAME]!.data as Float32Array;

  return mapLogitsToPrediction(logits, id2label);
}
