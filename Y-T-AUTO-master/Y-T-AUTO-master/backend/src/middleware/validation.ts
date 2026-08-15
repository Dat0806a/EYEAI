import { NextFunction, Request, Response } from 'express';
import { ZodSchema } from 'zod';

export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Dữ liệu gửi lên không hợp lệ.',
          details: result.error.issues,
        },
      });
      return;
    }
    req.body = result.data;
    next();
  };
}
