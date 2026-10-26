import { Router } from 'express';
import { sitesController } from './sites.controller.js';
import { authMiddleware } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/role.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import { Role } from '../../shared/index.js';
import {
  CreateSiteSchema,
  UpdateSiteSchema,
  SiteQuerySchema,
  AssignSupervisorsSchema,
} from '../../shared/index.js';

const router = Router();

router.use(authMiddleware);

router.get('/', validateQuery(SiteQuerySchema), sitesController.listSites);
router.get('/:id', sitesController.getSiteById);

router.post(
  '/',
  requireRole(Role.OWNER, Role.ACCOUNTANT),
  validateBody(CreateSiteSchema),
  sitesController.createSite
);

router.put(
  '/:id',
  requireRole(Role.OWNER, Role.ACCOUNTANT),
  validateBody(UpdateSiteSchema),
  sitesController.updateSite
);

router.post(
  '/:id/archive',
  requireRole(Role.OWNER, Role.ACCOUNTANT),
  sitesController.archiveSite
);

router.post(
  '/:id/supervisors',
  requireRole(Role.OWNER, Role.ACCOUNTANT),
  validateBody(AssignSupervisorsSchema),
  sitesController.assignSupervisors
);

export const sitesRoutes = router;
