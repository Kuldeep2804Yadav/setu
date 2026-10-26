import rateLimit from 'express-rate-limit';
import { config } from '../config/index.js';
import { PrismaRateLimitStore } from '../services/sharedRateLimit.service.js';

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: config.isTest ? 1000 : 20, // 20 attempts per 15 min in prod/dev
  standardHeaders: true,
  legacyHeaders: false,
  store: config.isTest ? undefined : new PrismaRateLimitStore(),
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please wait a few minutes before trying again.',
    },
  },
});

export const apiRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: config.isTest ? 5000 : 120, // 120 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  store: config.isTest ? undefined : new PrismaRateLimitStore(),
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please slow down.',
    },
  },
});
