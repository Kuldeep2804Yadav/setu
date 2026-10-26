import { Request, Response, NextFunction, CookieOptions } from 'express';
import { authService } from './auth.service.js';
import { config } from '../../config/index.js';
import { sessionCookieOptions } from '../../config/cookies.js';

const getCookieOptions = (): CookieOptions => {
  return {
    ...sessionCookieOptions(),
    maxAge: config.sessionExpiryDays * 24 * 60 * 60 * 1000,
    path: '/',
  };
};

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ip = req.ip || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];
      const result = await authService.register(req.body, ip, userAgent);

      res.cookie(config.sessionCookieName, result.rawToken, getCookieOptions());

      res.status(201).json({
        success: true,
        data: {
          user: result.user,
          expiresAt: result.expiresAt,
          token: result.rawToken, // Also provided in payload for clients/tests that use Authorization header
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ip = req.ip || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];
      const result = await authService.login(req.body, ip, userAgent);

      res.cookie(config.sessionCookieName, result.rawToken, getCookieOptions());

      res.status(200).json({
        success: true,
        data: {
          user: result.user,
          expiresAt: result.expiresAt,
          token: result.rawToken,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await authService.logout(
        req.sessionId,
        req.user?.organizationId,
        req.user?.id
      );

      res.clearCookie(config.sessionCookieName, sessionCookieOptions());

      res.status(200).json({
        success: true,
        data: { message: 'Logged out successfully' },
      });
    } catch (error) {
      next(error);
    }
  }

  async me(req: Request, res: Response): Promise<void> {
    res.status(200).json({
      success: true,
      data: {
        user: req.user,
      },
    });
  }

  async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.forgotPassword(req.body);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.resetPassword(req.body);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
