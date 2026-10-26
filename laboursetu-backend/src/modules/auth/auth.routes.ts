import { Router } from 'express';
import { authController } from './auth.controller.js';
import { authMiddleware } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { authRateLimiter } from '../../middleware/rateLimit.js';
import {
  RegisterSchema,
  LoginSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
} from '../../shared/index.js';

const router = Router();

router.post(
  '/register',
  authRateLimiter,
  validateBody(RegisterSchema),
  authController.register
);

router.post(
  '/login',
  authRateLimiter,
  validateBody(LoginSchema),
  authController.login
);

router.post('/logout', authMiddleware, authController.logout);

router.get('/me', authMiddleware, authController.me);

router.post(
  '/forgot-password',
  authRateLimiter,
  validateBody(ForgotPasswordSchema),
  authController.forgotPassword
);

router.post(
  '/reset-password',
  authRateLimiter,
  validateBody(ResetPasswordSchema),
  authController.resetPassword
);

export const authRoutes = router;
