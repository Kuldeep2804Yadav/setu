import { Request, Response, NextFunction } from 'express';
import { organizationService } from './organization.service.js';

export class OrganizationController {
  async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const org = await organizationService.getProfile(req.user!.organizationId);
      res.status(200).json({
        success: true,
        data: org,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const org = await organizationService.updateProfile(
        req.user!.organizationId,
        req.user!.id,
        req.body
      );
      res.status(200).json({
        success: true,
        data: org,
      });
    } catch (error) {
      next(error);
    }
  }

  async listTeamMembers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const members = await organizationService.listTeamMembers(
        req.user!.organizationId
      );
      res.status(200).json({
        success: true,
        data: members,
      });
    } catch (error) {
      next(error);
    }
  }

  async addTeamMember(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const member = await organizationService.addTeamMember(
        req.user!.organizationId,
        req.user!.id,
        req.body
      );
      res.status(201).json({
        success: true,
        data: member,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateTeamMember(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const member = await organizationService.updateTeamMember(
        req.user!.organizationId,
        req.user!.id,
        req.params.id as string,
        req.body
      );
      res.status(200).json({
        success: true,
        data: member,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const organizationController = new OrganizationController();
