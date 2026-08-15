import { Request, Response } from 'express';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { config } from '../config';
import { getDb } from '../database';
import { createOcrProvider } from '../services/ocr';
import { AuthedRequest } from '../middleware/auth';
import { uuid } from '../utils/age';

export async function scanOcr(req: AuthedRequest, res: Response): Promise<void> {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({
        success: false,
        data: null,
        error: { code: 'NO_FILE', message: 'Vui lòng tải lên một tệp ảnh giấy xét nghiệm.' },
      });
      return;
    }
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    // Development-only fallback: khi chưa cấu hình GEMINI_API_KEY, cho phép tệp
    // text/plain để provider DEV_FALLBACK có thể parse mẫu thử (chỉ dành cho dev).
    if (config.geminiApiKey === '') {
      allowed.push('text/plain');
    }
    if (!allowed.includes(file.mimetype)) {
      res.status(400).json({
        success: false,
        data: null,
        error: { code: 'UNSUPPORTED_FILE', message: 'Định dạng tệp không được hỗ trợ. Chỉ chấp nhận JPEG, PNG, WEBP hoặc PDF.' },
      });
      return;
    }
    const maxBytes = config.maxFileSizeMb * 1024 * 1024;
    if (file.size > maxBytes) {
      res.status(400).json({
        success: false,
        data: null,
        error: { code: 'FILE_TOO_LARGE', message: `Tệp tối đa ${config.maxFileSizeMb}MB.` },
      });
      return;
    }

    mkdirSync(config.uploadDir, { recursive: true });
    const storedName = `${uuid()}__${file.originalname}`;
    const storedPath = join(config.uploadDir, storedName);
    writeFileSync(storedPath, file.buffer);

    const reportId = uuid();
    const db = await getDb();
    await db.run(
      'INSERT INTO lab_reports (id, user_id, image_reference, status, source_type) VALUES (?, ?, ?, ?, ?)',
      reportId,
      req.userId as string,
      storedPath,
      'PENDING',
      'UPLOAD',
    );

    const provider = createOcrProvider();
    const output = await provider.scanAndNormalize(file.buffer);
    await db.run("UPDATE lab_reports SET status = 'PROCESSED', updated_at = datetime('now') WHERE id = ?", reportId);

    res.json({
      success: true,
      data: { reportId, provider: provider.name, results: output.results },
      error: null,
    });
  } catch (err) {
    const e = err as Error;
    console.error(e);
    res.status(500).json({
      success: false,
      data: null,
      error: { code: 'OCR_FAILED', message: e.message ?? 'Không thể đọc giấy xét nghiệm.' },
    });
  }
}
