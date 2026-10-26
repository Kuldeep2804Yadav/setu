import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { BadRequestError } from '../utils/errors.js';
import { ErrorCode } from '../shared/index.js';

function isZodError(error: any): error is ZodError {
  return error instanceof ZodError || error?.name === 'ZodError' || Array.isArray(error?.issues);
}

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error: any) {
      if (isZodError(error)) {
        const issues = error.errors || error.issues || [];
        const details = issues.map((err: any) => ({
          field: Array.isArray(err.path) ? err.path.join('.') : String(err.path || ''),
          message: err.message,
        }));
        return next(
          new BadRequestError('Validation failed', ErrorCode.VALIDATION_ERROR, details)
        );
      }
      next(error);
    }
  };
}

export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.query = schema.parse(req.query) as any;
      next();
    } catch (error: any) {
      if (isZodError(error)) {
        const issues = error.errors || error.issues || [];
        const details = issues.map((err: any) => ({
          field: Array.isArray(err.path) ? err.path.join('.') : String(err.path || ''),
          message: err.message,
        }));
        return next(
          new BadRequestError('Invalid query parameters', ErrorCode.VALIDATION_ERROR, details)
        );
      }
      next(error);
    }
  };
}

export function validateParams<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.params = schema.parse(req.params) as any;
      next();
    } catch (error: any) {
      if (isZodError(error)) {
        const issues = error.errors || error.issues || [];
        const details = issues.map((err: any) => ({
          field: Array.isArray(err.path) ? err.path.join('.') : String(err.path || ''),
          message: err.message,
        }));
        return next(
          new BadRequestError('Invalid route parameters', ErrorCode.VALIDATION_ERROR, details)
        );
      }
      next(error);
    }
  };
}
