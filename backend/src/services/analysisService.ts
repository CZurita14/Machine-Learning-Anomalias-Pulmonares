import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { writeFile, readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { env } from '../config/env.js';
import { runInference } from './inferenceService.js';
import type { AnalysisResult } from '../schemas/analyze.schemas.js';
export async function analyzeUploadedImage(
  buffer: Buffer,
  originalFilename: string,
): Promise<AnalysisResult> {
  // Validar que el buffer sea una imagen decodificable
  await sharp(buffer).metadata();

  const savedFilename = `upload_${randomUUID().slice(0, 8)}.jpg`;
  const savedPath = path.join(env.UPLOADS_DIR, savedFilename);
  await writeFile(savedPath, buffer);

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

export async function analyzeSampleImage(imageName: string): Promise<AnalysisResult> {
  // Las imágenes de muestra de demo ahora se leen físicamente y se pasan por el modelo
  const samplePath = path.join(process.cwd(), 'samples', imageName);
  const buffer = await readFile(samplePath);
  
  // Validar la imagen
  await sharp(buffer).metadata();

  const prediction = await runInference(buffer);
  const anomalyDetected = prediction.label === 'PNEUMONIA';

  return {
    anomaly_detected: anomalyDetected,
    disease: anomalyDetected ? 'Infiltrado pulmonar / Posible Neumonía (Muestra)' : 'Pulmones Sanos (Muestra)',
    confidence: prediction.confidence,
    zones: anomalyDetected ? ['Análisis global (ViT)'] : [],
    saved_path: null,
  };
}
