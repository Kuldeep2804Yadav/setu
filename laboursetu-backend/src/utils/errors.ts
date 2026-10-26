import { ErrorCode } from '../shared/index.js';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode | string;
  public readonly details?: any;

  constructor(
    message: string,
    statusCode: number = 500,
    code: ErrorCode | string = ErrorCode.INTERNAL_SERVER_ERROR,
    details?: any
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string = 'Bad request', code: ErrorCode | string = ErrorCode.VALIDATION_ERROR, details?: any) {
    super(message, 400, code, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Authentication required', code: ErrorCode | string = ErrorCode.UNAUTHORIZED) {
    super(message, 401, code);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Access forbidden', code: ErrorCode | string = ErrorCode.FORBIDDEN) {
    super(message, 403, code);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found', code: ErrorCode | string = ErrorCode.NOT_FOUND) {
    super(message, 404, code);
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource already exists', code: ErrorCode | string = ErrorCode.CONFLICT, details?: any) {
    super(message, 409, code, details);
  }
}
