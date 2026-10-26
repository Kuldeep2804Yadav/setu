import { Request, Response, NextFunction } from 'express';
import { dashboardService } from './dashboard.service.js';

export class DashboardController {
  async getMetrics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const metrics = await dashboardService.getMetrics(
        req.user!.organizationId
      );
      res.status(200).json({
        success: true,
        data: metrics,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const dashboardController = new DashboardController();
