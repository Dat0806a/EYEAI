import { Router } from 'express';
import multer from 'multer';
import { scanOcr } from '../controllers/ocrController';
import { requireAuth } from '../middleware/auth';
import { config } from '../config';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxFileSizeMb * 1024 * 1024 },
});

export const ocrRouter = Router();

ocrRouter.post('/scan', requireAuth, upload.single('reportImage'), scanOcr);
