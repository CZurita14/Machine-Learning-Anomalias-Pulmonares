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
