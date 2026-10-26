import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors.js';
import { ErrorCode } from '../shared/index.js';
import { Prisma } from '../database/index.js';
import { config } from '../config/index.js';

export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // 1. Handled AppError
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
    return;
  }

  // 2. Direct Zod Errors
  if (err?.name === 'ZodError' || Array.isArray(err?.issues)) {
    const issues = err.errors || err.issues || [];
    const details = issues.map((e: any) => ({
      field: Array.isArray(e.path) ? e.path.join('.') : String(e.path || ''),
      message: e.message,
    }));
    res.status(400).json({
      success: false,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Validation failed',
        details,
      },
    });
    return;
  }

  // 3. Prisma Known Request Errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = Array.isArray(err.meta?.target)
        ? (err.meta.target as string[]).join(', ')
        : (err.meta?.target as string) || 'unique field';
      res.status(409).json({
        success: false,
        error: {
          code: ErrorCode.CONFLICT,
          message: `A record with this ${target} already exists.`,
          details: err.meta,
        },
      });
      return;
    }

    if (err.code === 'P2025') {
      res.status(404).json({
        success: false,
        error: {
          code: ErrorCode.NOT_FOUND,
          message: 'Requested record was not found.',
        },
      });
      return;
    }
  }

  // 4. Fallback unhandled error
  console.error('Unhandled Server Error:', err);
  res.status(500).json({
    success: false,
    error: {
      code: ErrorCode.INTERNAL_SERVER_ERROR,
      message: 'An internal server error occurred. Please try again later.',
      ...(config.nodeEnv === 'development' ? { debug: err.message, stack: err.stack } : {}),
    },
  });
}
