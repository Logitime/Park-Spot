"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/api";
import { formatCurrency, formatDate, statusBadge } from "@/lib/utils";
import PolicyPanel from "@/components/PolicyPanel";
import type { AdminAnalytics, DailyTrendPoint } from "@/lib/types";

const ascent = (name: string) => {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
};

const initials = (name: string) =>
  name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

const compactMoney = (v: number) =>
  v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `$${v.toFixed(0)}`;

function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return <div className="h-8" />;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * 100;
    const y = 30 - (v / max) * 24;
    return `${x},${y.toFixed(2)}`;
  });
  return (
    <svg
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      className={`h-8 w-full ${className ?? ""}`}
    >
      <polygon points={`0,32 ${pts.join(" ")} 100,32`} className="fill-current opacity-10" />
      <polyline
        points={pts.join(" ")}
        fill="none"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-current"
      />
      <circle
        cx={100}
        cy={Number(pts[pts.length - 1].split(",")[1])}
        r="1.75"
        className="fill-current"
      />
    </svg>
  );
}

function Donut({ pct, tone }: { pct: number; tone: string }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(100, Math.max(0, pct)) / 100);
  return (
    <div className="relative h-14 w-14 shrink-0">
      <svg viewBox="0 0 56 56" className="h-14 w-14 -rotate-90">
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          strokeWidth="6.5"
          className="stroke-slate-100"
        />
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          strokeWidth="6.5"
          strokeDasharray={c}
          strokeDashoffset={off}
          strokeLinecap="round"
          className={`${tone} transition-[stroke-dashoffset] duration-700 ease-out`}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-xs font-bold text-slate-700">
        {Math.round(pct)}%
      </span>
    </div>
  );
}

let cachedAnalytics: AdminAnalytics | null = null;
let cachedAnalyticsTime: string | null = null;

export default function AdminPage() {
  const [data, setData] = useState<AdminAnalytics | null>(cachedAnalytics);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!cachedAnalytics);
  const [refresh, setRefresh] = useState(0);
  const [fetchedAt, setFetchedAt] = useState<string | null>(cachedAnalyticsTime);

  const load = useCallback(() => {
    apiGet<AdminAnalytics>("/api/admin/analytics")
      .then((d) => {
        cachedAnalytics = d;
        const now = new Date().toLocaleTimeString();
        cachedAnalyticsTime = now;
        setData(d);
        setFetchedAt(now);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load analytics")
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void load();
  }, [load, refresh]);

  if (loading && !data) {
    return (
      <main className="mx-auto max-w-7xl flex-1 px-4 py-8 sm:px-6">
        <div className="space-y-6">
          <div className="h-6 w-56 animate-pulse rounded-lg bg-slate-100" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-36 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
          <div className="h-56 animate-pulse rounded-2xl bg-slate-100" />
          <div className="h-72 animate-pulse rounded-2xl bg-slate-100" />
        </div>
      </main>
    );
  }

  if (error && !data) {
    return (
      <main className="mx-auto flex max-w-3xl flex-1 flex-col items-center px-4 py-24 text-center">
        <h1 className="text-2xl font-bold text-slate-800">Operator dashboard</h1>
        <p className="mt-3 text-slate-500">{error}</p>
        <Link
          href="/login"
          className="mt-6 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
        >
          Log in as operator / admin
        </Link>
      </main>
    );
  }

  const trend = data?.dailyTrend ?? [];
  const stats = [
    {
      label: "Revenue",
      value: formatCurrency(data?.summary.totalRevenue ?? 0),
      icon: <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" strokeLinecap="round" />,
      tone: "from-emerald-500 to-teal-600",
      text: "text-emerald-600",
      values: trend.map((d) => d.revenue),
      delta: pickDelta(trend, (d) => d.revenue),
      sub: "vs yesterday",
      sparkle: true,
    },
    {
      label: "Reservations",
      value: String(data?.summary.totalReservations ?? 0),
      icon: <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15zM9 7h6M9 11h6" strokeLinecap="round" strokeLinejoin="round" />,
      tone: "from-teal-500 to-emerald-600",
      text: "text-teal-600",
      values: trend.map((d) => d.reservations),
      delta: pickDelta(trend, (d) => d.reservations),
      sub: "vs yesterday",
      sparkle: true,
    },
    {
      label: "Paid transactions",
      value: String(data?.summary.totalPayments ?? 0),
      icon: <path d="M12 2l7 4v6c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-4zM9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />,
      tone: "from-sky-500 to-indigo-600",
      text: "text-sky-600",
      values: trend.map((d) => d.revenue),
      delta: null,
      sub: "all time",
      sparkle: false,
    },
    {
      label: "Registered users",
      value: String(data?.summary.totalUsers ?? 0),
      icon: <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" strokeLinejoin="round" />,
      tone: "from-violet-500 to-purple-600",
      text: "text-violet-600",
      values: trend.map((d) => d.reservations),
      delta: null,
      sub: "all accounts",
      sparkle: false,
    },
  ];

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-3 sm:px-6 py-6 sm:py-8 min-w-0">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-800">
              Operations overview
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-100">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              Live
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Occupancy, revenue, and reservations across all lots.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">
            {fetchedAt ? `Updated ${fetchedAt}` : "Loading…"}
          </span>
          <button
            onClick={() => setRefresh((r) => r + 1)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm transition hover:border-teal-300 hover:text-teal-700"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-4 w-4"
            >
              <path d="M20 11A8 8 0 1 0 18 15m2-11v5h-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, i) => (
          <div
            key={stat.label}
            className="animate-rise rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-900/5 transition hover:shadow-md"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-500">{stat.label}</p>
              <span
                className={`grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br text-white ${stat.tone}`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-4 w-4"
                >
                  {stat.icon}
                </svg>
              </span>
            </div>
            <p className="mt-1.5 text-2xl font-bold tabular-nums tracking-tight text-slate-800">
              {stat.value}
            </p>
            <div className="mt-1 flex items-center gap-2 text-xs">
              {stat.delta && (
                <span
                  className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold ${
                    stat.delta.up
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-rose-50 text-rose-600"
                  }`}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    className={`h-3 w-3 ${stat.delta.up ? "" : "rotate-180"}`}
                  >
                    <path d="M7 17L17 7M8 7h9v9" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {stat.delta.pct}%
                </span>
              )}
              <span className="text-slate-400">{stat.sub}</span>
            </div>
            {stat.sparkle && (
              <div className={`mt-2 ${stat.text}`}>
                <Sparkline values={stat.values} />
              </div>
            )}
          </div>
        ))}
      </div>

      <PolicyPanel />

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <div
          className="animate-rise rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-900/5 lg:col-span-2"
          style={{ animationDelay: "260ms" }}
        >
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-800">Occupancy by lot</h2>
              <p className="text-xs text-slate-400">Live availability per parking lot</p>
            </div>
          </div>
          <div className="space-y-4">
            {(data?.lots ?? [])
              .slice()
              .sort((a, b) => b.occupancyPct - a.occupancyPct)
              .map((lot, i) => {
                const tone =
                  lot.occupancyPct >= 90
                    ? "stroke-rose-500"
                    : lot.occupancyPct >= 60
                      ? "stroke-amber-500"
                      : "stroke-emerald-500";
                const bar =
                  lot.occupancyPct >= 90
                    ? "bg-rose-500"
                    : lot.occupancyPct >= 60
                      ? "bg-amber-500"
                      : "bg-emerald-500";
                return (
                  <div
                    key={lot.lotId}
                    className="flex items-center gap-4"
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <Donut pct={lot.occupancyPct} tone={tone} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate font-medium text-slate-800">
                          {lot.name}
                        </p>
                        <p className="text-xs text-slate-400">
                          {lot.available} / {lot.total} free
                        </p>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${bar} transition-all duration-700 ease-out`}
                          style={{ width: `${lot.occupancyPct}%` }}
                        />
                      </div>
                    </div>
                    <div className="w-20 shrink-0 text-right">
                      <p className="text-sm font-bold tabular-nums text-emerald-600">
                        {formatCurrency(lot.revenue)}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {lot.confirmedToday} today
                      </p>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        <div
          className="animate-rise rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-900/5 lg:col-span-3"
          style={{ animationDelay: "320ms" }}
        >
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-800">Last 7 days</h2>
              <p className="text-xs text-slate-400">
                Reservations, check-ins, and revenue per day
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-gradient-to-t from-teal-600 to-teal-400" />
                Reservations
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-gradient-to-t from-sky-600 to-sky-400" />
                Check-ins
              </span>
            </div>
          </div>

          {trend.length > 0 ? (
            <div>
              <div className="relative h-44">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="absolute inset-x-0 border-t border-dashed border-slate-100"
                    style={{ bottom: `${(i / 3) * 100}%` }}
                  />
                ))}
                <div className="relative flex h-full items-end justify-between gap-2 sm:gap-4">
                  {trend.map((d, i) => {
                    const max = Math.max(
                      1,
                      ...trend.map((x) => Math.max(x.reservations, x.checkins))
                    );
                    const hRes = (d.reservations / max) * 100;
                    const hCheck = (d.checkins / max) * 100;
                    const isToday = i === trend.length - 1;
                    return (
                      <div
                        key={d.date}
                        className={`flex h-full flex-1 flex-col items-center justify-end rounded-xl pt-2 ${
                          isToday ? "bg-teal-50/70" : ""
                        }`}
                        title={`${d.label}: ${d.reservations} reservations, ${d.checkins} check-ins, ${formatCurrency(d.revenue)}`}
                      >
                        <p className="mb-1 text-[11px] font-semibold tabular-nums text-slate-500">
                          {compactMoney(d.revenue)}
                        </p>
                        <div className="flex h-28 w-full items-end justify-center gap-1 sm:gap-1.5">
                          <div
                            className="w-2.5 rounded-t-md bg-gradient-to-t from-teal-600 to-teal-400 transition-all duration-500 sm:w-4"
                            style={{ height: `${hRes}%` }}
                          />
                          <div
                            className="w-2.5 rounded-t-md bg-gradient-to-t from-sky-600 to-sky-400 transition-all duration-500 sm:w-4"
                            style={{ height: `${hCheck}%` }}
                          />
                        </div>
                        <p className="mt-2 text-xs font-medium text-slate-500">
                          {d.label}
                        </p>
                        <p className="text-[11px] tabular-nums text-slate-300">
                          {new Date(d.date).toLocaleDateString(undefined, {
                            month: "numeric",
                            day: "numeric",
                          })}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">No activity yet.</p>
          )}
        </div>
      </div>

      <div
        className="animate-rise mt-4 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-900/5"
        style={{ animationDelay: "380ms" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
          <div>
            <h2 className="font-semibold text-slate-800">Recent reservations</h2>
            <p className="text-xs text-slate-400">Latest bookings across all lots</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-medium text-slate-400">
              Export
            </span>
            {[
              { kind: "occupancy", label: "Occupancy" },
              { kind: "revenue", label: "Revenue" },
              { kind: "reservations", label: "Reservations" },
            ].map((b) => (
              <a
                key={b.kind}
                href={`/api/admin/reports?kind=${b.kind}`}
                className="download rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-teal-300 hover:text-teal-700"
              >
                {b.label} CSV
              </a>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-[11px] uppercase tracking-wider text-slate-400">
                <th className="px-5 py-3 font-semibold">Customer</th>
                <th className="px-5 py-3 font-semibold">Lot / Spot</th>
                <th className="px-5 py-3 text-right font-semibold">Amount</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {(data?.recentReservations ?? []).map((r) => (
                <tr
                  key={r.id}
                  className="transition-colors hover:bg-teal-50/40"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
                        style={{ backgroundColor: `hsl(${ascent(r.email)} 68% 45%)` }}
                      >
                        {initials(r.user)}
                      </span>
                      <div>
                        <p className="font-medium text-slate-800">{r.user}</p>
                        <p className="text-xs text-slate-400">{r.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <p className="text-slate-600">{r.lot}</p>
                    <p className="text-xs text-slate-400">Spot #{r.spot}</p>
                  </td>
                  <td className="px-5 py-3 text-right font-semibold tabular-nums text-slate-800">
                    {formatCurrency(r.amount)}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadge(r.status)}`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      {r.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 tabular-nums text-slate-500">
                    {formatDate(r.createdAt)}
                  </td>
                </tr>
              ))}
              {(data?.recentReservations ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-slate-400">
                    No reservations yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

function pickDelta(
  trend: DailyTrendPoint[],
  pick: (d: DailyTrendPoint) => number
): { pct: number; up: boolean } | null {
  if (trend.length < 2) return null;
  const today = pick(trend[trend.length - 1]);
  const yesterday = pick(trend[trend.length - 2]);
  if (yesterday === 0) {
    if (today === 0) return null;
    return { pct: 100, up: true };
  }
  const pct = Math.round(((today - yesterday) / yesterday) * 100);
  if (pct === 0) return null;
  return { pct: Math.abs(pct), up: pct > 0 };
}