"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { apiGet, apiPost, apiPut, payForReservation } from "@/lib/api";
import { formatCurrency, formatDate, statusBadge } from "@/lib/utils";
import type { Reservation } from "@/lib/types";

let cachedReservations: Reservation[] | null = null;

const STATUS_PRIORITY: Record<string, number> = {
  ACTIVE: 1,
  CONFIRMED: 2,
  PENDING: 3,
  COMPLETED: 4,
  EXPIRED: 5,
  CANCELLED: 6,
};

type FilterTab = "ALL" | "ACTIVE" | "COMPLETED" | "EXPIRED";

export default function ReservationsPage() {
  const [reservations, setReservations] = useState<Reservation[] | null>(cachedReservations);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [tab, setTab] = useState<FilterTab>("ALL");

  const load = useCallback(async () => {
    try {
      const data = await apiGet<{ reservations: Reservation[] }>(
        "/api/reservations"
      );
      cachedReservations = data.reservations;
      setReservations(data.reservations);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load bookings");
    }
  }, []);

  useEffect(() => {
    void apiGet<{ user: { role: string } | null }>("/api/auth/me").then((d) => {
      if (d.user?.role === "OPERATOR") {
        window.location.replace("/admin/operator");
      }
    });
    void load();
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [load]);

  async function cancelReservation(id: string) {
    setBusyId(id);
    try {
      await apiPut(`/api/reservations/${id}`, {});
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to cancel");
    } finally {
      setBusyId(null);
    }
  }

  async function payReservation(id: string) {
    setBusyId(id);
    try {
      const { mode } = await payForReservation(id);
      if (mode === "demo") await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed");
      setBusyId(null);
    }
  }

  async function checkIn(id: string) {
    setBusyId(id);
    try {
      await apiPost(`/api/reservations/${id}/checkin`, {});
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check-in failed");
    } finally {
      setBusyId(null);
    }
  }

  async function checkOut(id: string) {
    setBusyId(id);
    try {
      await apiPost(`/api/reservations/${id}/checkout`, {});
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check-out failed");
    } finally {
      setBusyId(null);
    }
  }

  // Rearrange: Active & upcoming first, then sorted by date
  const sortedReservations = useMemo(() => {
    if (!reservations) return [];
    return [...reservations].sort((a, b) => {
      const pA = STATUS_PRIORITY[a.status] ?? 99;
      const pB = STATUS_PRIORITY[b.status] ?? 99;
      if (pA !== pB) return pA - pB;
      return new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
    });
  }, [reservations]);

  const counts = useMemo(() => {
    const list = reservations ?? [];
    return {
      all: list.length,
      active: list.filter((r) => r.status === "ACTIVE" || r.status === "CONFIRMED" || r.status === "PENDING").length,
      completed: list.filter((r) => r.status === "COMPLETED").length,
      expired: list.filter((r) => r.status === "EXPIRED" || r.status === "CANCELLED").length,
    };
  }, [reservations]);

  const filteredReservations = useMemo(() => {
    if (tab === "ALL") return sortedReservations;
    if (tab === "ACTIVE") {
      return sortedReservations.filter((r) => r.status === "ACTIVE" || r.status === "CONFIRMED" || r.status === "PENDING");
    }
    if (tab === "COMPLETED") {
      return sortedReservations.filter((r) => r.status === "COMPLETED");
    }
    if (tab === "EXPIRED") {
      return sortedReservations.filter((r) => r.status === "EXPIRED" || r.status === "CANCELLED");
    }
    return sortedReservations;
  }, [sortedReservations, tab]);

  const getCardStyle = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return "border-2 border-emerald-500 bg-gradient-to-br from-emerald-50/50 via-white to-white shadow-md ring-1 ring-emerald-500/20";
      case "CONFIRMED":
        return "border border-sky-300 bg-white shadow-sm";
      case "PENDING":
        return "border border-amber-300 bg-amber-50/20 shadow-sm";
      case "COMPLETED":
        return "border border-blue-200/90 bg-white shadow-xs";
      case "EXPIRED":
        return "border border-rose-200 bg-rose-50/25 shadow-xs";
      case "CANCELLED":
        return "border border-slate-200 bg-slate-50/60 opacity-80";
      default:
        return "border border-slate-200 bg-white";
    }
  };

  const renderBadge = (status: string) => {
    if (status === "ACTIVE") {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold text-white shadow-xs">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-200 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
          </span>
          ACTIVE
        </span>
      );
    }
    if (status === "COMPLETED") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-blue-600/30">
          <svg className="h-3.5 w-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
          </svg>
          COMPLETED
        </span>
      );
    }
    if (status === "EXPIRED") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-600/30">
          <svg className="h-3.5 w-3.5 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          EXPIRED
        </span>
      );
    }
    return (
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadge(status)}`}>
        {status}
      </span>
    );
  };

  if (error && !reservations) {
    return (
      <main className="mx-auto flex max-w-3xl flex-1 flex-col items-center px-4 py-24 text-center">
        <h1 className="text-2xl font-bold text-slate-800">My bookings</h1>
        <p className="mt-3 text-slate-500">{error}</p>
        <Link
          href="/login"
          className="mt-6 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
        >
          Log in
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-3 sm:px-6 py-6 sm:py-8 min-w-0">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">My bookings</h1>
          <p className="mt-1 text-sm text-slate-500">
            View active sessions, upcoming reservations, and history.
          </p>
        </div>
        <Link
          href="/"
          className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-teal-700 transition"
        >
          Find parking
        </Link>
      </div>

      {/* Filter Tabs */}
      <div className="mb-6 flex flex-wrap gap-1.5 rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-slate-200">
        <button
          onClick={() => setTab("ALL")}
          className={`rounded-xl px-3.5 py-2 text-xs font-medium transition ${
            tab === "ALL"
              ? "bg-teal-600 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-50 hover:text-teal-700"
          }`}
        >
          All ({counts.all})
        </button>
        <button
          onClick={() => setTab("ACTIVE")}
          className={`rounded-xl px-3.5 py-2 text-xs font-medium transition flex items-center gap-1.5 ${
            tab === "ACTIVE"
              ? "bg-emerald-600 text-white shadow-xs"
              : "text-slate-600 hover:bg-emerald-50 hover:text-emerald-700"
          }`}
        >
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          Active & Upcoming ({counts.active})
        </button>
        <button
          onClick={() => setTab("COMPLETED")}
          className={`rounded-xl px-3.5 py-2 text-xs font-medium transition ${
            tab === "COMPLETED"
              ? "bg-blue-600 text-white shadow-xs"
              : "text-slate-600 hover:bg-blue-50 hover:text-blue-700"
          }`}
        >
          Completed ({counts.completed})
        </button>
        <button
          onClick={() => setTab("EXPIRED")}
          className={`rounded-xl px-3.5 py-2 text-xs font-medium transition ${
            tab === "EXPIRED"
              ? "bg-rose-600 text-white shadow-xs"
              : "text-slate-600 hover:bg-rose-50 hover:text-rose-700"
          }`}
        >
          Expired & Cancelled ({counts.expired})
        </button>
      </div>

      {reservations === null ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : filteredReservations.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
          <h2 className="font-semibold text-slate-700">No bookings found in this category</h2>
          <p className="mt-2 text-sm text-slate-500">
            {tab === "ALL" ? "Reserve a spot and it will show up here." : "Switch tabs or book a new spot."}
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 transition shadow-xs"
          >
            Find a spot
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredReservations.map((r) => {
            const startMs = new Date(r.startTime).getTime();
            const checkinOpen = r.status === "CONFIRMED" && now >= startMs - 3_600_000;
            return (
              <div
                key={r.id}
                className={`rounded-2xl p-4 sm:p-5 transition ${getCardStyle(r.status)}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-slate-900 text-base sm:text-lg">
                        {r.spot.zone.lot.name}
                      </h2>
                      {renderBadge(r.status)}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      Spot #{r.spot.number} · {r.spot.zone.name} · Floor{" "}
                      {r.spot.zone.floor}
                      {r.vehicle ? ` · ${r.vehicle.plateNumber}` : ""}
                    </p>
                  </div>
                  <p className="text-xl font-bold tabular-nums text-slate-900">
                    {formatCurrency(r.totalPrice)}
                  </p>
                </div>

                <div className="mt-3.5 grid grid-cols-2 gap-3 rounded-xl bg-slate-50/80 p-3.5 text-sm ring-1 ring-slate-900/5">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">START</p>
                    <p className="mt-0.5 font-medium text-slate-700 text-xs sm:text-sm">
                      {formatDate(r.startTime)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">END</p>
                    <p className="mt-0.5 font-medium text-slate-700 text-xs sm:text-sm">
                      {formatDate(r.endTime)}
                    </p>
                  </div>
                </div>

                {r.qrCode && (r.status === "CONFIRMED" || r.status === "ACTIVE") && (
                  <div className="mt-3.5 flex flex-col sm:flex-row items-center gap-4 rounded-xl border border-teal-100 bg-teal-50/70 p-4">
                    <QRCodeSVG
                      value={JSON.stringify({
                        type: "parking",
                        reservationId: r.id,
                        code: r.qrCode,
                      })}
                      size={96}
                      level="M"
                      bgColor="#f0fdfa"
                      fgColor="#0f172a"
                      className="rounded-lg border border-teal-200 bg-white p-1.5 shrink-0 shadow-xs"
                    />
                    <div className="min-w-0 text-center sm:text-left">
                      <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">
                        Entry Gate Pass
                      </p>
                      <p className="font-mono text-xl font-bold tracking-widest text-slate-800 mt-0.5">
                        {r.qrCode}
                      </p>
                      <p className="mt-1 text-xs text-teal-700">
                        Scan at entry gate camera or present to operator.
                      </p>
                    </div>
                  </div>
                )}

                {(r.status === "PENDING" || r.status === "CONFIRMED" || r.status === "ACTIVE") && (
                  <div className="mt-4 flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                    {r.status === "PENDING" && (
                      <button
                        onClick={() => payReservation(r.id)}
                        disabled={busyId === r.id}
                        className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 shadow-xs transition"
                      >
                        Pay {formatCurrency(r.totalPrice)}
                      </button>
                    )}
                    {r.status === "CONFIRMED" && checkinOpen && (
                      <button
                        onClick={() => checkIn(r.id)}
                        disabled={busyId === r.id}
                        className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 shadow-xs transition"
                      >
                        Check in now
                      </button>
                    )}
                    {r.status === "CONFIRMED" && !checkinOpen && (
                      <span className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-medium text-slate-500">
                        Check-in opens 1h before start
                      </span>
                    )}
                    {r.status === "ACTIVE" && (
                      <button
                        onClick={() => checkOut(r.id)}
                        disabled={busyId === r.id}
                        className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-50 shadow-xs transition"
                      >
                        Check out & exit
                      </button>
                    )}
                    <button
                      onClick={() => cancelReservation(r.id)}
                      disabled={busyId === r.id}
                      className="rounded-xl border border-rose-200 px-3.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50 transition ml-auto"
                    >
                      Cancel booking
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}