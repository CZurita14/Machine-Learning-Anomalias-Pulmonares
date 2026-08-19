import { Router } from 'express';
import { modelReady } from '../middlewares/modelReady.js';
import { upload } from '../middlewares/upload.js';
import { postAnalyzeUpload, getAnalyzeSample } from '../controllers/analyze.controller.js';

export const analyzeRouter = Router();

analyzeRouter.post('/analyze-upload', modelReady, upload.single('file'), postAnalyzeUpload);
analyzeRouter.get('/analyze-sample', modelReady, getAnalyzeSample);
