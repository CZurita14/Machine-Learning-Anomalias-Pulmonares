import 'dotenv/config';
import { mkdir } from 'node:fs/promises';
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
  app.use((_req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada.' });
  });
  app.use(errorHandler);

  await mkdir(env.UPLOADS_DIR, { recursive: true });

  console.log('Cargando modelo de Inteligencia Artificial (ONNX)...');
  try {
    await loadModel();
    console.log('¡Modelo ONNX cargado exitosamente!');
  } catch (err) {
    console.error('Error al cargar el modelo:', err);
  }

  const server = app.listen(env.PORT, '0.0.0.0', () => {
    console.log(`API ejecutándose y escuchando en todas las interfaces: http://0.0.0.0:${env.PORT}`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `El puerto ${env.PORT} ya está en uso. Cierra el otro proceso del servidor o cambia PORT en tu .env.`,
      );
    } else {
      console.error('Error al iniciar el servidor:', err);
    }
    process.exit(1);
  });
}

main().catch((err) => {
  console.error('Error fatal al iniciar el servidor:', err);
  process.exit(1);
});
