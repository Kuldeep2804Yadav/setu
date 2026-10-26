import { Request, Response, NextFunction } from 'express';
import { workersService } from './workers.service.js';

export class WorkersController {
  async listWorkers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await workersService.listWorkers(
        req.user!.organizationId,
        req.query as any
      );
      res.status(200).json({
        success: true,
        data: result.workers,
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  }

  async getWorkerById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const worker = await workersService.getWorkerById(
        req.user!.organizationId,
        req.params.id as string
      );
      res.status(200).json({
        success: true,
        data: worker,
      });
    } catch (error) {
      next(error);
    }
  }

  async createWorker(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const worker = await workersService.createWorker(
        req.user!.organizationId,
        req.user!.id,
        req.body
      );
      res.status(201).json({
        success: true,
        data: worker,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateWorker(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const worker = await workersService.updateWorker(
        req.user!.organizationId,
        req.user!.id,
        req.params.id as string,
        req.body
      );
      res.status(200).json({
        success: true,
        data: worker,
      });
    } catch (error) {
      next(error);
    }
  }

  async archiveWorker(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await workersService.archiveWorker(
        req.user!.organizationId,
        req.user!.id,
        req.params.id as string
      );
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async addWageRate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const wageRate = await workersService.addWageRate(
        req.user!.organizationId,
        req.user!.id,
        req.params.id as string,
        req.body
      );
      res.status(201).json({
        success: true,
        data: wageRate,
      });
    } catch (error) {
      next(error);
    }
  }

  async assignSite(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const assignment = await workersService.assignSite(
        req.user!.organizationId,
        req.user!.id,
        req.params.id as string,
        req.body
      );
      res.status(200).json({
        success: true,
        data: assignment,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const workersController = new WorkersController();
