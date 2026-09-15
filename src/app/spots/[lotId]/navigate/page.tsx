"use client";

import { useCallback, useMemo } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { usePolling } from "@/lib/usePolling";
import { apiGet } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import type { Lot } from "@/lib/types";

const LotMap = dynamic(() => import("@/components/LotMap"), { ssr: false });

export default function NavigatePage() {
  const params = useParams<{ lotId: string }>();
  const lotId = params.lotId;

  const fetchLots = useCallback(() => apiGet<{ lots: Lot[] }>("/api/lots"), []);
  const { data } = usePolling(fetchLots, 10 * 60_000);
  const lot = useMemo(
    () => data?.lots.find((l) => l.id === lotId),
    [data, lotId]
  );

  if (!lot) {
    return (
      <main className="mx-auto flex max-w-7xl flex-1 flex-col items-center px-4 py-24 text-center">
        <h1 className="text-2xl font-bold text-slate-800">Loading…</h1>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <div className="mb-6">
        <Link
          href={`/spots/${lot.id}`}
          className="text-sm font-medium text-teal-600 hover:underline"
        >
          ← Back to {lot.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-800">
          Get directions
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {lot.address} · From{" "}
          <span className="font-semibold text-slate-700">
            {formatCurrency(lot.baseHourlyRate)}
          </span>
          /hr
        </p>
      </div>

      <LotMap
        name={lot.name}
        address={lot.address}
        latitude={lot.latitude}
        longitude={lot.longitude}
      />

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-800">On arrival</h2>
        <ul className="mt-3 space-y-2 text-sm text-slate-600">
          <li className="flex gap-2">
            <span className="text-teal-600">1.</span> Select a spot and reserve
            it with your preferred start time.
          </li>
          <li className="flex gap-2">
            <span className="text-teal-600">2.</span> Your booking generates a
            QR gate pass in <b>My bookings</b>.
          </li>
          <li className="flex gap-2">
            <span className="text-teal-600">3.</span> Show the QR code at the
            entry gate — the operator scans it to check you in.
          </li>
          <li className="flex gap-2">
            <span className="text-teal-600">4.</span> On exit, tap{" "}
            <b>Check out &amp; exit</b> (or ask the gate operator).
          </li>
        </ul>
      </div>
    </main>
  );
}