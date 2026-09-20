import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getPolicy, setPolicy, logAudit } from "@/lib/settings";
import { z } from "zod";

export const dynamic = "force-dynamic";

const policyPatchSchema = z.object({
  pendingCancelMinutes: z.number().int().min(1).max(240).optional(),
  noShowGraceMinutes: z.number().int().min(0).max(240).optional(),
  autoCompleteMinutes: z.number().int().min(0).max(240).optional(),
  freeCancelMinutes: z.number().int().min(0).max(1440).optional(),
  partialRefundEnabled: z.boolean().optional(),
  surgeMinMultiplier: z.number().min(0.1).max(5).optional(),
  surgeMaxMultiplier: z.number().min(0.1).max(5).optional(),
  surgeHighOccupancy: z.number().int().min(1).max(100).optional(),
});

export async function GET() {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ policy: await getPolicy() });
}

export async function PUT(request: NextRequest) {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role === "USER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = policyPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validation failed" },
      { status: 400 }
    );
  }

  const next = await setPolicy(parsed.data);
  await logAudit({
    userId: session.userId,
    userRole: session.role,
    action: "POLICY_UPDATED",
    details: JSON.stringify(parsed.data),
  });

  return NextResponse.json({ policy: next });
}