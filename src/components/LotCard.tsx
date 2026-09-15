"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/utils";
import AvailabilityBar from "@/components/AvailabilityBar";
import type { Lot } from "@/lib/types";

export default function LotCard({ lot }: { lot: Lot }) {
  const router = useRouter();
  const availability = {
    lotId: lot.id,
    name: lot.name,
    total: lot.totalSpots,
    available: lot.available,
    occupied: lot.totalSpots - lot.available,
    reserved: 0,
    occupancyPct: Math.round(
      ((lot.totalSpots - lot.available) / lot.totalSpots) * 100
    ),
    zones: [],
  };

  return (
    <Link
      href={`/spots/${lot.id}`}
      className="group block overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:border-teal-300 hover:shadow-lg"
    >
      <div className="relative h-36 bg-gradient-to-br from-teal-500 to-emerald-600 p-5">
        <div className="flex items-start justify-between">
          <span className="rounded-lg bg-white/20 px-2 py-1 text-xs font-semibold text-white">
            {lot.zones.length} zones
          </span>
          <span className="rounded-lg bg-white px-2 py-1 text-sm font-bold text-teal-700">
            {formatCurrency(lot.baseHourlyRate)}/hr
          </span>
        </div>
        <svg
          viewBox="0 0 200 80"
          className="absolute bottom-4 left-5 h-16 w-40 opacity-40"
          fill="none"
        >
          <path d="M0 60 H200 M0 40 H200 M30 60 V20 H70 V60 M100 60 V20 H140 V60" stroke="white" strokeWidth="3" />
        </svg>
      </div>

      <div className="p-5">
        <div className="mb-1 flex items-start justify-between gap-2">
          <h3 className="font-semibold text-slate-800 group-hover:text-teal-700">
            {lot.name}
          </h3>
        </div>
        <p className="mb-4 text-sm text-slate-500">{lot.address}</p>
        <AvailabilityBar availability={availability} />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1 text-sm font-medium text-teal-600">
            View spots
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-4 w-4 transition group-hover:translate-x-1"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </span>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              router.push(`/spots/${lot.id}/navigate`);
            }}
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Navigate ↗
          </button>
        </div>
      </div>
    </Link>
  );
}