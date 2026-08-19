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

import { getSecondOpinion } from '../services/secondOpinionService.js';
import { z } from 'zod';

export async function postSecondOpinion(req: Request, res: Response, next: NextFunction) {
  try {
    const bodySchema = z.object({
      imagePath: z.string().min(1)
    });
    const body = bodySchema.parse(req.body);
    
    const report = await getSecondOpinion(body.imagePath);
    res.status(200).json({ report });
  } catch (err) {
    next(err);
  }
}

import { processChat, ChatMessage } from '../services/chatService.js';

export async function postChat(req: Request, res: Response, next: NextFunction) {
  try {
    const bodySchema = z.object({
      messages: z.array(z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string()
      }))
    });
    const body = bodySchema.parse(req.body);
    
    const response = await processChat(body.messages as ChatMessage[]);
    res.status(200).json({ response });
  } catch (err) {
    next(err);
  }
}
