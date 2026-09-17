"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet } from "@/lib/api";
import AdminTabs from "@/components/AdminTabs";

type SpotInfo = {
  id: string;
  number: number;
  status: string;
  size: string;
  evCharging: boolean;
  accessible: boolean;
};

type ZoneInfo = {
  id: string;
  name: string;
  floor: number;
  available: number;
  occupied: number;
  reserved: number;
  spots: SpotInfo[];
};

type LotInfo = {
  id: string;
  name: string;
  total: number;
  available: number;
  occupied: number;
  reserved: number;
  occupancyPct: number;
  zones: ZoneInfo[];
};

const POLL_MS = 5000;

const STATUS_TONE: Record<string, string> = {
  AVAILABLE: "bg-emerald-500 text-white",
  OCCUPIED: "bg-rose-500 text-white",
  RESERVED: "bg-amber-400 text-white",
};

const countTone = (n: number) =>
  n >= 90 ? "text-rose-600" : n >= 60 ? "text-amber-600" : "text-emerald-600";

function Donut({ pct }: { pct: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(100, Math.max(0, pct)) / 100);
  const tone =
    pct >= 90
      ? "stroke-rose-500"
      : pct >= 60
        ? "stroke-amber-500"
        : "stroke-emerald-500";
  return (
    <div className="relative h-14 w-14 shrink-0">
      <svg viewBox="0 0 56 56" className="h-14 w-14 -rotate-90">
        <circle
          cx={28}
          cy={28}
          r={r}
          fill="none"
          strokeWidth="6.5"
          className="stroke-slate-100"
        />
        <circle
          cx={28}
          cy={28}
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

export default function ParkingStatusPage() {
  const [lots, setLots] = useState<LotInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const initialized = useRef(false);

  const load = useCallback(async () => {
    if (typeof document !== "undefined" && document.hidden) return;
    try {
      const data = await apiGet<{ lots: LotInfo[] }>("/api/admin/parking/status");
      setLots(data.lots);
      setError(null);
      setFetchedAt(new Date().toLocaleTimeString());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load parking status");
    }
  }, []);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      void load();
    }
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [load, refresh]);

  const total = lots?.reduce(
    (s, l) => ({
      available: s.available + l.available,
      occupied: s.occupied + l.occupied,
      reserved: s.reserved + l.reserved,
    }),
    { available: 0, occupied: 0, reserved: 0 }
  );
  const allCount = total ? total.available + total.occupied + total.reserved : 0;

  return (
    <main className="mx-auto max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-800">
              Parking Status
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
            Real-time availability of every parking spot.
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
            Refresh
          </button>
        </div>
      </div>

      <AdminTabs />

      {error && (
        <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">
          {error}
        </div>
      )}

      {!lots && !error && (
        <div className="space-y-6">
          {[1, 2].map((i) => (
            <div key={i} className="h-64 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      )}

      {lots && (
        <>
          {allCount > 0 && (
            <div className="mb-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-900/5">
                <p className="text-xs font-medium text-slate-500">Free</p>
                <p className="text-2xl font-bold tabular-nums text-emerald-600">
                  {total?.available}
                </p>
              </div>
              <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-900/5">
                <p className="text-xs font-medium text-slate-500">Occupied</p>
                <p className="text-2xl font-bold tabular-nums text-rose-600">
                  {total?.occupied}
                </p>
              </div>
              <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-900/5">
                <p className="text-xs font-medium text-slate-500">Reserved</p>
                <p className="text-2xl font-bold tabular-nums text-amber-600">
                  {total?.reserved}
                </p>
              </div>
            </div>
          )}

          {lots.length === 0 && (
            <p className="text-sm text-slate-400">
              No parking lots configured yet.
            </p>
          )}

          <div className="space-y-6">
            {lots.map((lot) => (
              <div
                key={lot.id}
                className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-900/5"
              >
                <div className="flex flex-wrap items-center gap-4">
                  <Donut pct={lot.occupancyPct} />
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-semibold text-slate-800">
                      {lot.name}
                    </h2>
                    <p className="text-sm text-slate-500">
                      <span className={`font-semibold ${countTone(lot.occupancyPct)}`}>
                        {lot.available}
                      </span>{" "}
                      free · {lot.occupied} occupied · {lot.reserved} reserved ·{" "}
                      {lot.total} total
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
                      Free
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm bg-rose-500" />
                      Occupied
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm bg-amber-400" />
                      Reserved
                    </span>
                  </div>
                </div>

                <div className="mt-5 space-y-5">
                  {lot.zones.map((zone) => (
                    <div key={zone.id}>
                      <div className="mb-2 flex items-baseline justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-700">
                          {zone.name}
                          <span className="ml-2 text-xs font-normal text-slate-400">
                            Floor {zone.floor}
                          </span>
                        </p>
                        <p className="text-xs text-slate-400">
                          {zone.available} free / {zone.spots.length}
                        </p>
                      </div>
                      {zone.spots.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {zone.spots.map((spot) => {
                            const tags = [
                              spot.evCharging ? "EV" : null,
                              spot.accessible ? "ACC" : null,
                              spot.size !== "STANDARD" ? spot.size : null,
                            ]
                              .filter(Boolean)
                              .join(" · ");
                            return (
                              <span
                                key={spot.id}
                                title={`Spot #${spot.number} · ${spot.status}${tags ? ` · ${tags}` : ""}`}
                                className={`grid h-9 w-9 place-items-center rounded-lg text-[11px] font-semibold transition hover:scale-105 ${STATUS_TONE[spot.status] ?? "bg-slate-200 text-slate-600"}`}
                              >
                                {spot.number}
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400">
                          No spots in this zone.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}