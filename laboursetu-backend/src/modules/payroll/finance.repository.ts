import { createHash } from "node:crypto";
import { Prisma, prisma } from "../../database/index.js";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
} from "../../utils/errors.js";
import { CalculationError } from "./calculation.js";

export type Tx = Prisma.TransactionClient;
export interface Actor {
  id: string;
  organizationId: string;
  role: string;
}
export const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value));
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export async function lockFinance(tx: Tx, organizationId: string) {
  await tx.financeMutex.upsert({
    where: { id: organizationId },
    create: { id: organizationId, version: 1 },
    update: { version: { increment: 1 } },
  });
}
export async function sourceTransaction<T>(
  organizationId: string,
  run: (tx: Tx) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          await lockFinance(tx, organizationId);
          return run(tx);
        },
        { timeout: 30000, maxWait: 10000 },
      );
    } catch (error) {
      if (
        ["P2034", "P2002"].includes((error as { code?: string }).code ?? "") &&
        attempt < 4
      )
        continue;
      throw error;
    }
  }
  throw new ConflictError(
    "Concurrent attendance or wage change; retry the request",
  );
}
export async function authorize(tx: Tx, actor: Actor, owner = false) {
  const user = await tx.user.findFirst({
    where: {
      id: actor.id,
      organizationId: actor.organizationId,
      isActive: true,
    },
  });
  if (
    !user ||
    !["OWNER", "ACCOUNTANT"].includes(user.role) ||
    (owner && user.role !== "OWNER")
  )
    throw new ForbiddenError("Financial access is not permitted");
  return user;
}
export async function audit(
  tx: Tx,
  actor: Actor,
  action: string,
  entityId: string,
  details: unknown,
) {
  await tx.payrollAuditLog.create({
    data: {
      organizationId: actor.organizationId,
      actorId: actor.id,
      action,
      entityId,
      details: json(details),
    },
  });
}

export async function financialTransaction<T>(
  actor: Actor,
  key: string,
  operation: string,
  payload: unknown,
  run: (tx: Tx) => Promise<T>,
): Promise<T> {
  if (!/^[A-Za-z0-9_-]{8,120}$/.test(key))
    throw new BadRequestError(
      "Idempotency-Key header of 8–120 characters is required",
    );
  const hash = createHash("sha256")
    .update(canonical({ operation, payload, actorId: actor.id }))
    .digest("hex");
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          await authorize(tx, actor);
          await lockFinance(tx, actor.organizationId);
          const previous = await tx.financialRequest.findUnique({
            where: {
              organizationId_key: { organizationId: actor.organizationId, key },
            },
          });
          if (previous) {
            if (previous.hash !== hash)
              throw new ConflictError(
                "Idempotency key was already used for another request",
              );
            return previous.result as T;
          }
          const result = await run(tx);
          await tx.financialRequest.create({
            data: {
              organizationId: actor.organizationId,
              key,
              hash,
              result: json(result),
            },
          });
          return result;
        },
        { maxWait: 10000, timeout: 30000 },
      );
    } catch (error) {
      if (error instanceof CalculationError)
        throw new BadRequestError(error.message);
      const code = (error as { code?: string }).code;
      if (["P2034", "P2002"].includes(code ?? "") && attempt < 4) continue;
      if (code === "P2002")
        throw new ConflictError("Duplicate financial record");
      throw error;
    }
  }
  throw new ConflictError(
    "Concurrent financial change; retry with the same idempotency key",
  );
}
