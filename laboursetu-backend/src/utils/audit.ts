import { prisma } from '../database/index.js';

export interface AuditParams {
  organizationId: string;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: any;
  ipAddress?: string | null;
}

export async function logAudit(params: AuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: params.organizationId,
        userId: params.userId ?? null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        metadata: params.metadata ?? {},
        ipAddress: params.ipAddress ?? null,
      },
    });
  } catch (error) {
    // Non-blocking error for audit log failures
    console.error('Audit log failed:', error);
  }
}
