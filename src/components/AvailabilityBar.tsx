"use client";

import type { LotAvailability } from "@/lib/types";

export default function AvailabilityBar({
  availability,
}: {
  availability: LotAvailability;
}) {
  const pct = availability.occupancyPct;
  const available = availability.available;
  const total = availability.total;

  const barColor =
    pct >= 90 ? "bg-rose-500" : pct >= 60 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span
          className={`font-semibold ${available > 0 ? "text-emerald-600" : "text-slate-400"}`}
        >
          {available > 0 ? `${available} spots free` : "Full"}
        </span>
        <span className="text-xs text-slate-500">
          {total - available} occupied · {pct}%
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${barColor} transition-all`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}