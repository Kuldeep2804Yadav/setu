import { Request, Response, NextFunction } from 'express';
import { sitesService } from './sites.service.js';

export class SitesController {
  async listSites(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await sitesService.listSites(
        req.user!.organizationId,
        req.query as any
      );
      res.status(200).json({
        success: true,
        data: result.sites,
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  }

  async getSiteById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const site = await sitesService.getSiteById(
        req.user!.organizationId,
        req.params.id as string
      );
      res.status(200).json({
        success: true,
        data: site,
      });
    } catch (error) {
      next(error);
    }
  }

  async createSite(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const site = await sitesService.createSite(
        req.user!.organizationId,
        req.user!.id,
        req.body
      );
      res.status(201).json({
        success: true,
        data: site,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateSite(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const site = await sitesService.updateSite(
        req.user!.organizationId,
        req.user!.id,
        req.params.id as string,
        req.body
      );
      res.status(200).json({
        success: true,
        data: site,
      });
    } catch (error) {
      next(error);
    }
  }

  async archiveSite(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const site = await sitesService.archiveSite(
        req.user!.organizationId,
        req.user!.id,
        req.params.id as string
      );
      res.status(200).json({
        success: true,
        data: site,
      });
    } catch (error) {
      next(error);
    }
  }

  async assignSupervisors(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const site = await sitesService.assignSupervisors(
        req.user!.organizationId,
        req.user!.id,
        req.params.id as string,
        req.body
      );
      res.status(200).json({
        success: true,
        data: site,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const sitesController = new SitesController();
