"use client";

import { statusColor } from "@/lib/utils";
import type { Spot } from "@/lib/types";

interface ParkingGridProps {
  spots: Spot[];
  selectedSpotId?: string | null;
  onSelect?: (spot: Spot | null) => void;
}

export default function ParkingGrid({
  spots,
  selectedSpotId,
  onSelect,
}: ParkingGridProps) {
  const grouped = new Map<string, Spot[]>();
  for (const spot of spots) {
    const key = spot.zone.id;
    const list = grouped.get(key) ?? [];
    list.push(spot);
    grouped.set(key, list);
  }

  const zones = [...grouped.entries()].sort(
    ([, a], [, b]) => a[0].zone.floor - b[0].zone.floor
  );

  return (
    <div className="space-y-6">
      {zones.map(([zoneId, zoneSpots]) => {
        const zone = zoneSpots[0].zone;
        const available = zoneSpots.filter((s) => s.status === "AVAILABLE").length;
        return (
          <div key={zoneId} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-800">
                  {zone.name}
                  <span className="ml-2 text-xs font-normal text-slate-400">
                    Floor {zone.floor}
                  </span>
                </h3>
                <p className="text-xs text-slate-500">
                  {available} of {zoneSpots.length} available
                </p>
              </div>
              {zone.priceMultiplier !== 1 && (
                <span className="rounded-full bg-teal-50 px-2 py-1 text-xs font-medium text-teal-700">
                  {zone.priceMultiplier > 1 ? "+" : ""}
                  {Math.round((zone.priceMultiplier - 1) * 100)}% rate
                </span>
              )}
            </div>

            <div className="grid grid-cols-6 gap-2 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12">
              {zoneSpots.map((spot) => {
                const selected = spot.id === selectedSpotId;
                const clickable = spot.status === "AVAILABLE" && onSelect;
                return (
                  <button
                    key={spot.id}
                    type="button"
                    disabled={!clickable}
                    onClick={() => {
                      if (!onSelect) return;
                      onSelect(selected ? null : spot);
                    }}
                    title={`Spot ${spot.number} - ${spot.status}${spot.evCharging ? " (EV)" : ""}${spot.accessible ? " (Accessible)" : ""}`}
                    className={`relative flex h-14 flex-col items-center justify-center rounded-lg border text-xs font-semibold transition ${
                      selected
                        ? "border-teal-600 ring-2 ring-teal-300"
                        : clickable
                          ? "cursor-pointer hover:scale-105"
                          : "cursor-not-allowed"
                    } ${statusColor(spot.status)} ${
                      spot.status === "AVAILABLE" ? "text-emerald-950" : "text-white"
                    }`}
                  >
                    <span className="text-sm leading-none">{spot.number}</span>
                    <span className="mt-0.5 text-[9px] font-medium uppercase leading-none opacity-80">
                      {spot.size.slice(0, 4)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {zones.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-500">
          No spots match the current filters.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-emerald-500" /> Available
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-amber-500" /> Reserved
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-rose-500" /> Occupied
        </span>
      </div>
    </div>
  );
}