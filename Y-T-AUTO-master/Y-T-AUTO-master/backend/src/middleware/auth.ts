import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { getDb } from '../database';

export interface AuthedRequest extends Request {
  userId?: string;
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      data: null,
      error: { code: 'UNAUTHORIZED', message: 'Bạn cần đăng nhập để sử dụng tính năng này.' },
    });
    return;
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { userId: string };
    const db = await getDb();
    const user = await db.get<{ id: string }>('SELECT id FROM users WHERE id = ?', payload.userId);
    if (!user) {
      res.status(401).json({
        success: false,
        data: null,
        error: { code: 'UNAUTHORIZED', message: 'Phiên đăng nhập không hợp lệ.' },
      });
      return;
    }
    req.userId = user.id;
    next();
  } catch {
    res.status(401).json({
      success: false,
      data: null,
      error: { code: 'UNAUTHORIZED', message: 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ.' },
    });
  }
}
