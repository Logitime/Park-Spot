import { NextRequest, NextResponse } from "next/server";
import { runMaintenanceSweep } from "@/lib/maintenance-sweep";
import { maybeSendDailyReport } from "@/lib/report";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runMaintenanceSweep();
  const report = await maybeSendDailyReport();
  return NextResponse.json({ ok: true, ...result, report });
}