"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { apiPost } from "@/lib/api";
import { calculatePrice, formatCurrency, hoursBetween } from "@/lib/utils";
import type { Reservation, Spot, User } from "@/lib/types";

interface ReservationFormProps {
  spot: Spot;
  user: User | null;
  onDone: (reservation: Reservation) => void;
}

function localDateTime(offsetMinutes = 0): string {
  const d = new Date(Date.now() + offsetMinutes * 60_000);
  d.setSeconds(0, 0);
  return d.toISOString().slice(0, 16);
}

export default function ReservationForm({
  spot,
  user,
  onDone,
}: ReservationFormProps) {
  const [start, setStart] = useState(localDateTime(60));
  const [end, setEnd] = useState(localDateTime(3 * 60));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Reservation | null>(null);

  const price = useMemo(() => {
    const startD = new Date(start);
    const endD = new Date(end);
    if (isNaN(startD.getTime()) || isNaN(endD.getTime())) return null;
    const hours = hoursBetween(startD, endD);
    if (hours <= 0) return null;
    return {
      hours,
      amount: calculatePrice(hours, spot.pricePerHour, spot.zone.priceMultiplier),
    };
  }, [start, end, spot]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!user) return;

    setSubmitting(true);
    try {
      const startD = new Date(start);
      const endD = new Date(end);
      const created = await apiPost<{ reservation: Reservation }>(
        "/api/reservations",
        {
          spotId: spot.id,
          startTime: startD.toISOString(),
          endTime: endD.toISOString(),
        }
      );

      const paid = await apiPost<{ reservation: Reservation }>(
        "/api/payments",
        { reservationId: created.reservation.id }
      );

      setResult(paid.reservation);
      onDone(paid.reservation);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reservation failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-emerald-500 text-white">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className="h-6 w-6"
          >
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-emerald-900">
          Reservation confirmed!
        </h3>
        <p className="mt-1 text-sm text-emerald-700">
          Spot #{result.spot.number} · {result.spot.zone.name} ·{" "}
          {formatCurrency(result.totalPrice)}
        </p>
        {result.qrCode && (
          <div className="mx-auto mt-4 w-fit rounded-xl bg-white p-4">
            <p className="text-xs font-mono tracking-widest text-slate-700">
              {result.qrCode}
            </p>
            <p className="mt-1 text-[10px] text-slate-400">
              Show this code at the entry gate
            </p>
          </div>
        )}
        <Link
          href="/reservations"
          className="mt-4 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          View my bookings
        </Link>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <h3 className="font-semibold text-slate-800">Reserve this spot</h3>
        <p className="mt-2 text-sm text-slate-500">
          Log in or create an account to reserve spot #{spot.number}.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Link
            href="/login"
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
          >
            Log in
          </Link>
          <Link
            href="/register"
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Sign up
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5"
    >
      <h3 className="font-semibold text-slate-800">
        Reserve Spot #{spot.number}
      </h3>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Start time
        </label>
        <input
          type="datetime-local"
          value={start}
          min={localDateTime()}
          onChange={(e) => setStart(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          End time
        </label>
        <input
          type="datetime-local"
          value={end}
          min={start}
          onChange={(e) => setEnd(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
        />
      </div>

      {price && (
        <div className="rounded-xl bg-slate-50 p-4 text-sm">
          <div className="flex justify-between text-slate-600">
            <span>Rate</span>
            <span>
              {formatCurrency(spot.pricePerHour)}/hr ×{" "}
              {spot.zone.priceMultiplier.toFixed(2)}
            </span>
          </div>
          <div className="mt-1 flex justify-between text-slate-600">
            <span>Duration</span>
            <span>{price.hours.toFixed(2)} hrs</span>
          </div>
          <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 font-semibold text-slate-800">
            <span>Total</span>
            <span>{formatCurrency(price.amount)}</span>
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || !price}
        className="w-full rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? "Reserving…" : "Reserve & pay"}
      </button>
      <p className="text-center text-[11px] text-slate-400">
        Demo checkout — no real charge is made.
      </p>
    </form>
  );
}