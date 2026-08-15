import express from 'express';
import cors from 'cors';
import { authRouter } from './routes/authRoutes';
import { ocrRouter } from './routes/ocrRoutes';
import { analysisRouter } from './routes/analysisRoutes';
import { chatRouter } from './routes/chatRoutes';
import { errorHandler, notFound } from './middleware/errors';
import { config } from './config';

const app = express();

app.use(cors({ origin: config.webOrigin, credentials: true }));
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (req, res) => {
  res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() }, error: null });
});

app.use('/api/auth', authRouter);
app.use('/api/ocr', ocrRouter);
app.use('/api/analysis', analysisRouter);
app.use('/api/chat', chatRouter);

app.use(notFound);
app.use(errorHandler);

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`Y Tế API listening on http://localhost:${config.port}`);
  });
}

export default app;
