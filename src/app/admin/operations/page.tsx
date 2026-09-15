"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { formatCurrency, formatDate, statusBadge } from "@/lib/utils";
import AdminTabs from "@/components/AdminTabs";
import type { OpsBoard } from "@/lib/types";

export default function OperationsPage() {
  const [board, setBoard] = useState<OpsBoard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiGet<OpsBoard>("/api/admin/operations");
      setBoard(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load operations board");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <main className="mx-auto max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Operations board</h1>
        <p className="mt-1 text-sm text-slate-500">
          Live view of what&apos;s on site, expected arrivals, overstays and the
          recent activity feed. Auto-refreshes every 30s.
        </p>
      </div>

      <AdminTabs />

      {error && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-slate-500">{error}</p>
        </div>
      )}

      {board && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="On site now"
              value={board.onSiteCount}
              tone="bg-teal-50 text-teal-700"
            />
            <StatCard
              label="Arriving in 24h"
              value={board.expectedCount}
              tone="bg-indigo-50 text-indigo-700"
            />
            <StatCard
              label="Overstaying"
              value={board.breachCount}
              tone={board.breachCount ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}
            />
            <StatCard
              label="Updated"
              value={formatDate(board.timestamp)}
              tone="bg-slate-50 text-slate-600"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="mb-1 font-semibold text-slate-800">On site · {board.onSiteCount}</h2>
              <p className="mb-3 text-xs text-slate-400">Active sessions</p>
              {board.onSite.length === 0 ? (
                <p className="text-sm text-slate-400">No active sessions.</p>
              ) : (
                <div className="space-y-2">
                  {board.onSite.map((r) => (
                    <Row
                      key={r.id}
                      r={r}
                      highlight={new Date(r.endTime).getTime() < new Date(board.timestamp).getTime()}
                    />
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="mb-1 font-semibold text-slate-800">Arriving in 24h · {board.expectedCount}</h2>
              <p className="mb-3 text-xs text-slate-400">Confirmed upcoming</p>
              {board.expected.length === 0 ? (
                <p className="text-sm text-slate-400">No upcoming arrivals.</p>
              ) : (
                <div className="space-y-2">
                  {board.expected.map((r) => (
                    <Row key={r.id} r={r} />
                  ))}
                </div>
              )}
            </section>
          </div>

          {board.breachCount > 0 && (
            <section className="rounded-2xl border border-rose-200 bg-rose-50/60 p-5">
              <h2 className="mb-1 font-semibold text-rose-800">
                Overstaying · {board.breachCount}
              </h2>
              <p className="mb-3 text-xs text-rose-500">
                Sessions still active past their reserved end time — authorize checkout or renew.
              </p>
              <div className="space-y-2">
                {board.breach.map((r) => (
                  <Row key={r.id} r={r} highlight />
                ))}
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 font-semibold text-slate-800">Occupancy by lot</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {board.lots.map((lot) => (
                <div key={lot.id} className="rounded-xl border border-slate-100 p-4">
                  <div className="flex items-baseline justify-between">
                    <p className="font-medium text-slate-700">{lot.name}</p>
                    <p className="text-sm font-semibold text-slate-800">{lot.occupancyPct}%</p>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${lot.occupancyPct >= 85 ? "bg-rose-500" : lot.occupancyPct >= 60 ? "bg-amber-500" : "bg-emerald-500"}`}
                      style={{ width: `${lot.occupancyPct}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-slate-400">
                    {lot.occupied} occupied · {lot.reserved} reserved · {lot.free} free / {lot.total}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 font-semibold text-slate-800">Activity feed</h2>
            {board.feed.length === 0 ? (
              <p className="text-sm text-slate-400">No activity yet.</p>
            ) : (
              <ul className="divide-y divide-slate-50">
                {board.feed.slice(0, 25).map((e) => (
                  <li key={e.id} className="flex items-start gap-3 py-2.5 text-sm">
                    <span className="mt-0.5 rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-500">
                      {e.action}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-slate-700">{e.details}</p>
                      <p className="text-xs text-slate-400">
                        {e.userRole ?? "system"} · {formatDate(e.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}

function Row({ r, highlight }: { r: OpsBoard["onSite"][number]; highlight?: boolean }) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 ${
        highlight ? "border-rose-200 bg-rose-50" : "border-slate-100"
      }`}
    >
      <div>
        <p className="font-medium text-slate-800">
          {r.spot.zone.lot.name} · #{r.spot.number}
          {r.vehicle?.plateNumber ? (
            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">
              {r.vehicle.plateNumber}
            </span>
          ) : null}
        </p>
        <p className="text-xs text-slate-400">
          {r.user.name} · {formatDate(r.startTime)} → {formatDate(r.endTime)} ·{" "}
          {formatCurrency(r.totalPrice)}
        </p>
      </div>
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(r.status)}`}>
        {r.status}
      </span>
    </div>
  );
}