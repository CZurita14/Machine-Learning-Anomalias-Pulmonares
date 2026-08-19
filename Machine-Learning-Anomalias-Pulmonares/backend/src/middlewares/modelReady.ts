import type { Request, Response, NextFunction } from 'express';
import { isModelReady } from '../services/inferenceService.js';

export function modelReady(req: Request, res: Response, next: NextFunction): void {
  if (!isModelReady()) {
    res.status(503).json({ error: 'El modelo de IA no está disponible todavía.' });
    return;
  }
  next();
}
