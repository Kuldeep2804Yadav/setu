import { Router } from 'express';
import { dashboardController } from './dashboard.controller.js';
import { authMiddleware } from '../../middleware/auth.js';

const router = Router();

router.use(authMiddleware);

router.get('/metrics', dashboardController.getMetrics);

export const dashboardRoutes = router;
