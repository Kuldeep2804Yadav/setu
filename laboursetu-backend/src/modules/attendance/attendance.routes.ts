import { Router } from 'express';
import { attendanceController } from './attendance.controller.js';
import { authMiddleware } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/role.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import { Role } from '../../shared/index.js';
import {
  BulkSaveAttendanceSchema,
  RejectSubmissionSchema,
  CreateCorrectionSchema,
  ReviewCorrectionSchema,
  SubmissionQuerySchema,
} from '../../shared/index.js';

const router = Router();

router.use(authMiddleware);

// Roster & Submissions
router.get('/roster/:siteId', attendanceController.getRoster);
router.post('/submissions', attendanceController.getOrCreateSubmission);
router.post('/submissions/init/:siteId', attendanceController.getOrCreateSubmission);
router.get('/submissions', validateQuery(SubmissionQuerySchema), attendanceController.listSubmissions);
router.get('/submissions/:id', attendanceController.getSubmissionDetails);
router.put(
  '/submissions/:id/draft',
  validateBody(BulkSaveAttendanceSchema),
  attendanceController.saveDraftEntries
);
router.post('/submissions/:id/submit', attendanceController.submitAttendance);
router.post(
  '/submissions/:id/approve',
  requireRole(Role.OWNER, Role.ACCOUNTANT),
  attendanceController.approveSubmission
);
router.post(
  '/submissions/:id/reject',
  requireRole(Role.OWNER, Role.ACCOUNTANT),
  validateBody(RejectSubmissionSchema),
  attendanceController.rejectSubmission
);

// Corrections
router.get('/corrections', attendanceController.listCorrections);
router.post(
  '/records/:id/corrections',
  validateBody(CreateCorrectionSchema),
  attendanceController.requestCorrection
);
router.post(
  '/corrections/:id/review',
  requireRole(Role.OWNER, Role.ACCOUNTANT),
  validateBody(ReviewCorrectionSchema),
  attendanceController.reviewCorrection
);

export const attendanceRoutes = router;
