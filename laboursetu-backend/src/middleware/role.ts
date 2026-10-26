import { Request, Response, NextFunction } from 'express';
import { Role } from '../shared/index.js';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';

export function requireRole(...allowedRoles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError());
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ForbiddenError(
          `Action restricted to roles: ${allowedRoles.join(', ')}. Current role: ${req.user.role}`
        )
      );
    }

    next();
  };
}
