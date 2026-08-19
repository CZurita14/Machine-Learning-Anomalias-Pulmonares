import type { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  console.error('Unhandled error:', err);
  const errorMsg = err instanceof Error ? err.message : 'Error interno del servidor.';
  res.status(500).json({ error: errorMsg });
}
