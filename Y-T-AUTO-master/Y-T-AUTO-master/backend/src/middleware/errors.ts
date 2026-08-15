import { NextFunction, Request, Response } from 'express';

export function notFound(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    data: null,
    error: { code: 'NOT_FOUND', message: 'Không tìm thấy tài nguyên.' },
  });
}

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
  console.error(err);
  res.status(500).json({
    success: false,
    data: null,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.',
    },
  });
}
