import { Router } from 'express';
import { sendMessage } from '../controllers/chatController';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validation';
import { chatMessageSchema } from '../schemas';

export const chatRouter = Router();

chatRouter.post('/message', requireAuth, validateBody(chatMessageSchema), sendMessage);
