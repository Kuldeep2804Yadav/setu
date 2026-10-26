import { Request, Response, NextFunction } from 'express';
import { attendanceService } from './attendance.service.js';

export class AttendanceController {
  async getRoster(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const siteId = req.params.siteId as string;
      const date = req.query.date as string;

      const roster = await attendanceService.getRoster(
        req.user!.organizationId,
        siteId,
        date,
        req.user!.id,
        req.user!.role
      );

      res.status(200).json({
        success: true,
        data: roster,
      });
    } catch (error) {
      next(error);
    }
  }

  async getOrCreateSubmission(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const siteId = (req.params.siteId as string) || req.body?.siteId;
      const date = (req.query.date as string) || req.body?.attendanceDate;

      const submission = await attendanceService.getOrCreateSubmission(
        req.user!.organizationId,
        siteId,
        date,
        req.user!.id,
        req.user!.role
      );

      res.status(200).json({
        success: true,
        data: submission,
      });
    } catch (error) {
      next(error);
    }
  }

  async getSubmissionDetails(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const submission = await attendanceService.getSubmissionDetails(
        req.user!.organizationId,
        req.params.id as string,
        req.user!.id,
        req.user!.role
      );

      res.status(200).json({
        success: true,
        data: submission,
      });
    } catch (error) {
      next(error);
    }
  }

  async listSubmissions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await attendanceService.listSubmissions(
        req.user!.organizationId,
        req.query as any,
        req.user!.id,
        req.user!.role
      );

      res.status(200).json({
        success: true,
        data: result.submissions,
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  }

  async saveDraftEntries(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const submission = await attendanceService.saveDraftEntries(
        req.user!.organizationId,
        req.params.id as string,
        req.body,
        req.user!.id,
        req.user!.role
      );

      res.status(200).json({
        success: true,
        data: submission,
      });
    } catch (error) {
      next(error);
    }
  }

  async submitAttendance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const submission = await attendanceService.submitAttendance(
        req.user!.organizationId,
        req.params.id as string,
        req.user!.id,
        req.user!.role
      );

      res.status(200).json({
        success: true,
        data: submission,
      });
    } catch (error) {
      next(error);
    }
  }

  async approveSubmission(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const submission = await attendanceService.approveSubmission(
        req.user!.organizationId,
        req.params.id as string,
        req.user!.id,
        req.user!.role
      );

      res.status(200).json({
        success: true,
        data: submission,
      });
    } catch (error) {
      next(error);
    }
  }

  async rejectSubmission(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const submission = await attendanceService.rejectSubmission(
        req.user!.organizationId,
        req.params.id as string,
        req.body,
        req.user!.id,
        req.user!.role
      );

      res.status(200).json({
        success: true,
        data: submission,
      });
    } catch (error) {
      next(error);
    }
  }

  async requestCorrection(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const correction = await attendanceService.requestCorrection(
        req.user!.organizationId,
        req.params.id as string,
        req.body,
        req.user!.id
      );

      res.status(201).json({
        success: true,
        data: correction,
      });
    } catch (error) {
      next(error);
    }
  }

  async reviewCorrection(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const correction = await attendanceService.reviewCorrection(
        req.user!.organizationId,
        req.params.id as string,
        req.body,
        req.user!.id,
        req.user!.role
      );

      res.status(200).json({
        success: true,
        data: correction,
      });
    } catch (error) {
      next(error);
    }
  }

  async listCorrections(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const corrections = await attendanceService.listCorrections(
        req.user!.organizationId,
        req.query as any
      );

      res.status(200).json({
        success: true,
        data: corrections,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const attendanceController = new AttendanceController();
