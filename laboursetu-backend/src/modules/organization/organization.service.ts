import { prisma, Role } from '../../database/index.js';
import {
  UpdateOrganizationInput,
  AddTeamMemberInput,
  UpdateTeamMemberInput,
  ErrorCode,
} from '../../shared/index.js';
import {
  ConflictError,
  NotFoundError,
  BadRequestError,
} from '../../utils/errors.js';
import { hashPassword } from '../../utils/crypto.js';
import { logAudit } from '../../utils/audit.js';

export class OrganizationService {
  async getProfile(organizationId: string) {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!org) {
      throw new NotFoundError('Organization not found.');
    }

    return org;
  }

  async updateProfile(
    organizationId: string,
    userId: string,
    input: UpdateOrganizationInput
  ) {
    const org = await prisma.organization.update({
      where: { id: organizationId },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
        ...(input.address !== undefined ? { address: input.address || null } : {}),
        ...(input.gstin !== undefined ? { gstin: input.gstin || null } : {}),
        ...(input.currency ? { currency: input.currency } : {}),
      },
    });

    await logAudit({
      organizationId,
      userId,
      action: 'ORGANIZATION_UPDATED',
      entityType: 'Organization',
      entityId: organizationId,
      metadata: input,
    });

    return org;
  }

  async listTeamMembers(organizationId: string) {
    const members = await prisma.user.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        _count: {
          select: {
            supervisorSites: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return members;
  }

  async addTeamMember(
    organizationId: string,
    actorUserId: string,
    input: AddTeamMemberInput
  ) {
    // Check if email already registered
    const existing = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existing) {
      throw new ConflictError(
        'A user with this email address already exists in the system.',
        ErrorCode.CONFLICT
      );
    }

    const passwordHash = await hashPassword(input.password);

    const member = await prisma.user.create({
      data: {
        organizationId,
        name: input.name,
        email: input.email,
        phone: input.phone || null,
        passwordHash,
        role: input.role as Role,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    await logAudit({
      organizationId,
      userId: actorUserId,
      action: 'TEAM_MEMBER_ADDED',
      entityType: 'User',
      entityId: member.id,
      metadata: { role: input.role, email: input.email },
    });

    return member;
  }

  async updateTeamMember(
    organizationId: string,
    actorUserId: string,
    targetUserId: string,
    input: UpdateTeamMemberInput
  ) {
    // Check member belongs to same tenant
    const member = await prisma.user.findFirst({
      where: {
        id: targetUserId,
        organizationId,
      },
    });

    if (!member) {
      throw new NotFoundError('Team member not found in your organization.');
    }

    if (member.role === Role.OWNER && input.role) {
      throw new BadRequestError('Cannot change the role of the primary organization owner.');
    }

    const updated = await prisma.user.update({
      where: { id: targetUserId },
      data: {
        ...(input.role ? { role: input.role as Role } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    await logAudit({
      organizationId,
      userId: actorUserId,
      action: 'TEAM_MEMBER_UPDATED',
      entityType: 'User',
      entityId: targetUserId,
      metadata: input,
    });

    return updated;
  }
}

export const organizationService = new OrganizationService();
