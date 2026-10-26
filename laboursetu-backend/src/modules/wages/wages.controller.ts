import { Request, Response, NextFunction } from 'express';
import { wagesService } from './wages.service.js';

export class WagesController {
  async getWageRegister(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const summary = await wagesService.getWageRegister(
        req.user!.organizationId,
        req.query as any
      );

      res.status(200).json({
        success: true,
        data: summary,
      });
    } catch (error) {
      next(error);
    }
  }

  async exportCsv(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const csv = await wagesService.exportCsv(
        req.user!.organizationId,
        req.query as any
      );

      const filename = `wage-register-${req.query.startDate || 'all'}-to-${req.query.endDate || 'all'}.csv`;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.status(200).send(csv);
    } catch (error) {
      next(error);
    }
  }
}

export const wagesController = new WagesController();
