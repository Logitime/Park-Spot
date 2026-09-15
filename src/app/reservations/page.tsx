"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import { formatCurrency, formatDate, statusBadge } from "@/lib/utils";
import type { Reservation } from "@/lib/types";

export default function ReservationsPage() {
  const [reservations, setReservations] = useState<Reservation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const data = await apiGet<{ reservations: Reservation[] }>(
        "/api/reservations"
      );
      setReservations(data.reservations);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load bookings");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
      await apiPost("/api/payments", { reservationId: id });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed");
    } finally {
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
    <main className="mx-auto max-w-4xl flex-1 px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">My bookings</h1>
        <Link
          href="/"
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
        >
          Find parking
        </Link>
      </div>

      {reservations === null ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : reservations.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
          <h2 className="font-semibold text-slate-700">No bookings yet</h2>
          <p className="mt-2 text-sm text-slate-500">
            Reserve a spot and it will show up here.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
          >
            Find a spot
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {reservations.map((r) => {
            const startMs = new Date(r.startTime).getTime();
            const checkinOpen = r.status === "CONFIRMED" && now >= startMs - 3_600_000;
            return (
              <div
                key={r.id}
                className="rounded-2xl border border-slate-200 bg-white p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold text-slate-800">
                        {r.spot.zone.lot.name}
                      </h2>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(r.status)}`}
                      >
                        {r.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      Spot #{r.spot.number} · {r.spot.zone.name} · Floor{" "}
                      {r.spot.zone.floor}
                      {r.vehicle ? ` · ${r.vehicle.plateNumber}` : ""}
                    </p>
                  </div>
                  <p className="text-lg font-bold text-slate-800">
                    {formatCurrency(r.totalPrice)}
                  </p>
                </div>

                <div className="mt-3 grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium text-slate-400">START</p>
                    <p className="font-medium text-slate-700">
                      {formatDate(r.startTime)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-400">END</p>
                    <p className="font-medium text-slate-700">
                      {formatDate(r.endTime)}
                    </p>
                  </div>
                </div>

                {r.qrCode && (r.status === "CONFIRMED" || r.status === "ACTIVE") && (
                  <div className="mt-3 flex flex-wrap items-center gap-4 rounded-xl border border-teal-100 bg-teal-50 p-4">
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
                      className="rounded-md border border-teal-200 bg-white p-1"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-medium uppercase tracking-wide text-teal-700">
                        Entry gate pass
                      </p>
                      <p className="font-mono text-lg font-semibold tracking-widest text-slate-700">
                        {r.qrCode}
                      </p>
                      <p className="mt-1 text-xs text-teal-700">
                        Show this QR code at the entry gate. Operators scan it
                        to check you in.
                      </p>
                    </div>
                  </div>
                )}

                {(r.status === "PENDING" || r.status === "CONFIRMED" || r.status === "ACTIVE") && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {r.status === "PENDING" && (
                      <button
                        onClick={() => payReservation(r.id)}
                        disabled={busyId === r.id}
                        className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                      >
                        Pay {formatCurrency(r.totalPrice)}
                      </button>
                    )}
                    {r.status === "CONFIRMED" && checkinOpen && (
                      <button
                        onClick={() => checkIn(r.id)}
                        disabled={busyId === r.id}
                        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        Check in now
                      </button>
                    )}
                    {r.status === "CONFIRMED" && !checkinOpen && (
                      <span className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-400">
                        Check-in opens 1h before start
                      </span>
                    )}
                    {r.status === "ACTIVE" && (
                      <button
                        onClick={() => checkOut(r.id)}
                        disabled={busyId === r.id}
                        className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50"
                      >
                        Check out & exit
                      </button>
                    )}
                    <button
                      onClick={() => cancelReservation(r.id)}
                      disabled={busyId === r.id}
                      className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                    >
                      Cancel
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