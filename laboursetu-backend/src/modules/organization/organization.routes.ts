import { Router } from 'express';
import { organizationController } from './organization.controller.js';
import { authMiddleware } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/role.js';
import { validateBody } from '../../middleware/validate.js';
import { Role } from '../../shared/index.js';
import {
  UpdateOrganizationSchema,
  AddTeamMemberSchema,
  UpdateTeamMemberSchema,
} from '../../shared/index.js';

const router = Router();

// Apply auth to all organization routes
router.use(authMiddleware);

router.get('/', organizationController.getProfile);

router.put(
  '/',
  requireRole(Role.OWNER),
  validateBody(UpdateOrganizationSchema),
  organizationController.updateProfile
);

router.get('/team', organizationController.listTeamMembers);

router.post(
  '/team',
  requireRole(Role.OWNER),
  validateBody(AddTeamMemberSchema),
  organizationController.addTeamMember
);

router.patch(
  '/team/:id',
  requireRole(Role.OWNER),
  validateBody(UpdateTeamMemberSchema),
  organizationController.updateTeamMember
);

export const organizationRoutes = router;
