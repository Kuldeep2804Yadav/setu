import { Router } from 'express';
import { wagesController } from './wages.controller.js';
import { authMiddleware } from '../../middleware/auth.js';
import { validateQuery } from '../../middleware/validate.js';
import { WageRegisterQuerySchema } from '../../shared/index.js';

const router = Router();

router.use(authMiddleware);

router.get(
  '/register',
  validateQuery(WageRegisterQuerySchema),
  wagesController.getWageRegister
);

router.get(
  '/register/export',
  validateQuery(WageRegisterQuerySchema),
  wagesController.exportCsv
);

export const wagesRoutes = router;
