import { Router, json } from 'express';
import { modelReady } from '../middlewares/modelReady.js';
import { upload } from '../middlewares/upload.js';
import { postAnalyzeUpload, getAnalyzeSample, postSecondOpinion, postChat } from '../controllers/analyze.controller.js';

export const analyzeRouter = Router();
analyzeRouter.use(json());

analyzeRouter.post('/analyze-upload', modelReady, upload.single('file'), postAnalyzeUpload);
analyzeRouter.get('/analyze-sample', modelReady, getAnalyzeSample);
analyzeRouter.post('/second-opinion', postSecondOpinion);
analyzeRouter.post('/chat', postChat);
