import { prisma, Role } from '../../database/index.js';
import {
  RegisterInput,
  LoginInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  ErrorCode,
} from '../../shared/index.js';
import {
  BadRequestError,
  ConflictError,
  UnauthorizedError,
  NotFoundError,
} from '../../utils/errors.js';
import {
  hashPassword,
  verifyPassword,
  generateSecureToken,
  hashToken,
} from '../../utils/crypto.js';
import { config } from '../../config/index.js';
import { logAudit } from '../../utils/audit.js';
import { emailOutboxService } from '../../services/emailOutbox.service.js';
import { invalidateSessionCache } from '../../middleware/auth.js';

export class AuthService {
  async register(input: RegisterInput, ipAddress?: string, userAgent?: string) {
    // 1. Check if user email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existingUser) {
      throw new ConflictError(
        'An account with this email address already exists.',
        ErrorCode.CONFLICT
      );
    }

    // 2. Generate slug & org code
    const slugBase = input.organizationName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const randomSuffix = generateSecureToken(3);
    const slug = `${slugBase}-${randomSuffix}`;
    const orgCode = `ORG-${generateSecureToken(3).toUpperCase()}`;

    const passwordHash = await hashPassword(input.password);

    // 3. Perform atomic transaction: create Org + Owner User
    const result = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: input.organizationName,
          slug,
          code: orgCode,
          phone: input.phone || null,
          currency: 'INR',
        },
      });

      const user = await tx.user.create({
        data: {
          organizationId: org.id,
          name: input.name,
          email: input.email,
          phone: input.phone || null,
          passwordHash,
          role: Role.OWNER, // Hardcoded: cannot be chosen by caller
          isActive: true,
        },
      });

      return { org, user };
    });

    // 4. Create Session
    const rawToken = generateSecureToken(32);
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(
      Date.now() + config.sessionExpiryDays * 24 * 60 * 60 * 1000
    );

    await prisma.session.create({
      data: {
        token: tokenHash,
        userId: result.user.id,
        organizationId: result.org.id,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
        expiresAt,
      },
    });

    await logAudit({
      organizationId: result.org.id,
      userId: result.user.id,
      action: 'USER_REGISTERED',
      entityType: 'User',
      entityId: result.user.id,
      ipAddress,
    });

    return {
      rawToken,
      expiresAt,
      user: {
        id: result.user.id,
        organizationId: result.org.id,
        name: result.user.name,
        email: result.user.email,
        phone: result.user.phone,
        role: result.user.role,
        organization: {
          id: result.org.id,
          name: result.org.name,
          slug: result.org.slug,
          code: result.org.code,
          currency: result.org.currency,
          gstin: result.org.gstin,
          phone: result.org.phone,
          address: result.org.address,
        },
      },
    };
  }

  async login(input: LoginInput, ipAddress?: string, userAgent?: string) {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      include: { organization: true },
    });

    // Timing-safe verification: if user doesn't exist, still run a dummy verify to prevent timing enumeration
    const dummyHash =
      '$argon2id$v=19$m=65536,t=3,p=1$abcdefghijklmnopqrstuvwxyz$abcdefghijklmnopqrstuvwxyz';

    if (!user || !user.isActive) {
      await verifyPassword(dummyHash, input.password);
      throw new UnauthorizedError(
        'Invalid email or password.',
        ErrorCode.INVALID_CREDENTIALS
      );
    }

    const isValid = await verifyPassword(user.passwordHash, input.password);
    if (!isValid) {
      throw new UnauthorizedError(
        'Invalid email or password.',
        ErrorCode.INVALID_CREDENTIALS
      );
    }

    // Create session
    const rawToken = generateSecureToken(32);
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(
      Date.now() + config.sessionExpiryDays * 24 * 60 * 60 * 1000
    );

    await prisma.session.create({
      data: {
        token: tokenHash,
        userId: user.id,
        organizationId: user.organizationId,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
        expiresAt,
      },
    });

    await logAudit({
      organizationId: user.organizationId,
      userId: user.id,
      action: 'USER_LOGIN',
      entityType: 'User',
      entityId: user.id,
      ipAddress,
    });

    return {
      rawToken,
      expiresAt,
      user: {
        id: user.id,
        organizationId: user.organizationId,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        organization: {
          id: user.organization.id,
          name: user.organization.name,
          slug: user.organization.slug,
          code: user.organization.code,
          currency: user.organization.currency,
          gstin: user.organization.gstin,
          phone: user.organization.phone,
          address: user.organization.address,
        },
      },
    };
  }

  async logout(sessionId?: string, organizationId?: string, userId?: string) {
    if (sessionId) {
      invalidateSessionCache();
      await prisma.session.delete({
        where: { id: sessionId },
      }).catch(() => {});
    }

    if (organizationId && userId) {
      await logAudit({
        organizationId,
        userId,
        action: 'USER_LOGOUT',
        entityType: 'User',
        entityId: userId,
      });
    }
  }

  async forgotPassword(input: ForgotPasswordInput) {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (!user || !user.isActive) {
      // Safe response: Do not leak whether user exists
      return { message: 'If this email is registered, you will receive password reset instructions.' };
    }

    const resetToken = generateSecureToken(32);
    const tokenHash = hashToken(resetToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    // Enqueue password reset email with bounded retry logic
    await emailOutboxService.enqueueEmail({
      recipient: user.email,
      subject: 'LabourSetu: Password Reset Request',
      payload: {
        userId: user.id,
        email: user.email,
        token: resetToken,
        expiresAt: expiresAt.toISOString(),
      },
    });

    // In production, send email. For development/testing, log or return token
    console.log(`[PASSWORD RESET] Token for ${user.email}: ${resetToken}`);

    return {
      message: 'If this email is registered, you will receive password reset instructions.',
      ...(config.isTest || config.nodeEnv === 'development' ? { debugToken: resetToken } : {}),
    };
  }

  async resetPassword(input: ResetPasswordInput) {
    const tokenHash = hashToken(input.token);

    const resetRecord = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!resetRecord || resetRecord.usedAt !== null || resetRecord.expiresAt < new Date()) {
      throw new BadRequestError(
        'Password reset link is invalid or has expired.',
        ErrorCode.VALIDATION_ERROR
      );
    }

    const newPasswordHash = await hashPassword(input.password);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetRecord.userId },
        data: { passwordHash: newPasswordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetRecord.id },
        data: { usedAt: new Date() },
      }),
      // Invalidate all active sessions for this user on password reset
      prisma.session.deleteMany({
        where: { userId: resetRecord.userId },
      }),
    ]);

    await logAudit({
      organizationId: resetRecord.user.organizationId,
      userId: resetRecord.userId,
      action: 'PASSWORD_RESET',
      entityType: 'User',
      entityId: resetRecord.userId,
    });

    return { message: 'Password has been reset successfully. Please log in with your new password.' };
  }
}

export const authService = new AuthService();
