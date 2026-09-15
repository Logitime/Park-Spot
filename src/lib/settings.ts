import { prisma } from "./prisma";

export interface PolicySettings {
  pendingCancelMinutes: number; // unpaid PENDING auto-cancel after N minutes
  noShowGraceMinutes: number; // CONFIRMED past start + N minutes without check-in → released
  autoCompleteMinutes: number; // ACTIVE past end + N minutes → auto completed
  freeCancelMinutes: number; // cancel within N minutes of start still gets a full refund
  partialRefundEnabled: boolean; // early-exit prorated refund on/off
  surgeMinMultiplier: number; // auto-surge floor
  surgeMaxMultiplier: number; // auto-surge ceiling
  surgeHighOccupancy: number; // occupancy % that triggers surge (0-100)
}

export const DEFAULT_POLICY: PolicySettings = {
  pendingCancelMinutes: 10,
  noShowGraceMinutes: 30,
  autoCompleteMinutes: 30,
  freeCancelMinutes: 15,
  partialRefundEnabled: true,
  surgeMinMultiplier: 1.0,
  surgeMaxMultiplier: 2.5,
  surgeHighOccupancy: 85,
};

const KEY = "booking_policy";

function toNum(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toBool(value: string | null, fallback: boolean): boolean {
  if (value === null) return fallback;
  return value === "true";
}

export async function getPolicy(): Promise<PolicySettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  if (!row) return DEFAULT_POLICY;
  const raw: Record<string, string> = JSON.parse(row.value);
  return {
    pendingCancelMinutes: toNum(raw.pendingCancelMinutes, DEFAULT_POLICY.pendingCancelMinutes),
    noShowGraceMinutes: toNum(raw.noShowGraceMinutes, DEFAULT_POLICY.noShowGraceMinutes),
    autoCompleteMinutes: toNum(raw.autoCompleteMinutes, DEFAULT_POLICY.autoCompleteMinutes),
    freeCancelMinutes: toNum(raw.freeCancelMinutes, DEFAULT_POLICY.freeCancelMinutes),
    partialRefundEnabled: toBool(raw.partialRefundEnabled, DEFAULT_POLICY.partialRefundEnabled),
    surgeMinMultiplier: toNum(raw.surgeMinMultiplier, DEFAULT_POLICY.surgeMinMultiplier),
    surgeMaxMultiplier: toNum(raw.surgeMaxMultiplier, DEFAULT_POLICY.surgeMaxMultiplier),
    surgeHighOccupancy: toNum(raw.surgeHighOccupancy, DEFAULT_POLICY.surgeHighOccupancy),
  };
}

export async function setPolicy(patch: Partial<PolicySettings>): Promise<PolicySettings> {
  const current = await getPolicy();
  const next = { ...current, ...patch };
  await prisma.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  });
  return next;
}

export interface AuditArgs {
  userId: string | null;
  userRole: string | null;
  action: string;
  details: string;
}

export async function logAudit(args: AuditArgs) {
  await prisma.auditLog.create({
    data: {
      userId: args.userId,
      userRole: args.userRole,
      action: args.action,
      details: args.details,
    },
  });
}