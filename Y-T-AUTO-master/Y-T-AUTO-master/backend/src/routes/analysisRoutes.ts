import { Router } from 'express';
import { confirmAndAnalyze, getHistory, getReportDetail } from '../controllers/analysisController';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validation';
import { confirmAnalysisSchema } from '../schemas';

export const analysisRouter = Router();

analysisRouter.post('/confirm', requireAuth, validateBody(confirmAnalysisSchema), confirmAndAnalyze);
analysisRouter.get('/history', requireAuth, getHistory);
analysisRouter.get('/history/:reportId', requireAuth, getReportDetail);
