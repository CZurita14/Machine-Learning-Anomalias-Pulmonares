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

export async function getAnalyzeSample(req: Request, res: Response, next: NextFunction) {
  try {
    const query = analyzeSampleQuerySchema.parse(req.query);
    const result = await analyzeSampleImage(query.image_name);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
