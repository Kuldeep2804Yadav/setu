import { Router } from 'express';
import { workersController } from './workers.controller.js';
import { authMiddleware } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/role.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import { Role } from '../../shared/index.js';
import {
  CreateWorkerSchema,
  UpdateWorkerSchema,
  WorkerQuerySchema,
  CreateWageRateSchema,
  AssignWorkerSiteSchema,
} from '../../shared/index.js';

const router = Router();

router.use(authMiddleware);

router.get('/', validateQuery(WorkerQuerySchema), workersController.listWorkers);
router.get('/:id', workersController.getWorkerById);

router.post(
  '/',
  requireRole(Role.OWNER, Role.ACCOUNTANT),
  validateBody(CreateWorkerSchema),
  workersController.createWorker
);

router.put(
  '/:id',
  requireRole(Role.OWNER, Role.ACCOUNTANT),
  validateBody(UpdateWorkerSchema),
  workersController.updateWorker
);

router.post(
  '/:id/archive',
  requireRole(Role.OWNER, Role.ACCOUNTANT),
  workersController.archiveWorker
);

router.post(
  '/:id/wage-rates',
  requireRole(Role.OWNER, Role.ACCOUNTANT),
  validateBody(CreateWageRateSchema),
  workersController.addWageRate
);

router.post(
  '/:id/assign-site',
  requireRole(Role.OWNER, Role.ACCOUNTANT, Role.SUPERVISOR),
  validateBody(AssignWorkerSiteSchema),
  workersController.assignSite
);

export const workersRoutes = router;
