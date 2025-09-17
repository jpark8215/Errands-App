import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';

  logger.error('Unhandled error', {
    status,
    message,
    ...(err.stack ? { stack: err.stack } : {})
  });

  res.status(status).json({
    success: false,
    error: {
      code: status === 400 ? 'BAD_REQUEST' : status === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR',
      message,
      details: err.details || undefined
    }
  });
}
