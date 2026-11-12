import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config/index.js';
import { csrfProtection } from './middleware/csrf.js';
import { apiRateLimiter } from './middleware/rateLimit.js';
import { errorHandler } from './middleware/errorHandler.js';
import { NotFoundError } from './utils/errors.js';

import { authRoutes } from './modules/auth/auth.routes.js';
import { organizationRoutes } from './modules/organization/organization.routes.js';
import { sitesRoutes } from './modules/sites/sites.routes.js';
import { workersRoutes } from './modules/workers/workers.routes.js';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes.js';
import { attendanceRoutes } from './modules/attendance/attendance.routes.js';
import { wagesRoutes } from './modules/wages/wages.routes.js';
import { financeRoutes } from './modules/payroll/finance.routes.js';

export const app = express();

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: false, // Handled by frontend if needed
    crossOriginEmbedderPolicy: false,
  })
);

// CORS configuration supporting cookie credentials
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or vitest)
      if (!origin) return callback(null, true);
      if (config.allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  })
);

app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));

// Apply CSRF defense on state-changing cookie requests
app.use(csrfProtection);

// Root health check
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount API v1 routes
const v1Router = express.Router();
v1Router.use(apiRateLimiter);

v1Router.use('/auth', authRoutes);
v1Router.use('/organization', organizationRoutes);
v1Router.use('/sites', sitesRoutes);
v1Router.use('/workers', workersRoutes);
v1Router.use('/dashboard', dashboardRoutes);
v1Router.use('/attendance', attendanceRoutes);
v1Router.use('/wages', wagesRoutes);
v1Router.use('/finance', financeRoutes);

app.use('/api/v1', v1Router);

// 404 handler
app.use((_req: Request, _res: Response, next) => {
  next(new NotFoundError('The requested endpoint does not exist.'));
});

// Centralized error handling
app.use(errorHandler);
