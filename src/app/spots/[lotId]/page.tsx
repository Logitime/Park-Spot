"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { usePolling } from "@/lib/usePolling";
import { apiGet } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import SearchFilters, { type SpotFilters } from "@/components/SearchFilters";
import ParkingGrid from "@/components/ParkingGrid";
import ReservationForm from "@/components/ReservationForm";
import type { Lot, Spot, User } from "@/lib/types";

function buildQuery(filters: SpotFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  for (const size of filters.sizes) params.append("size", size);
  if (filters.evCharging) params.set("evCharging", "true");
  if (filters.accessible) params.set("accessible", "true");
  if (filters.maxPrice) params.set("maxPrice", filters.maxPrice);
  return params.toString();
}

export default function LotSpotsPage() {
  const params = useParams<{ lotId: string }>();
  const lotId = params.lotId;

  const [filters, setFilters] = useState<SpotFilters>({
    status: "AVAILABLE",
    sizes: [],
    evCharging: false,
    accessible: false,
    maxPrice: "",
  });
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let active = true;
    apiGet<{ user: User | null }>("/api/auth/me")
      .then((data) => {
        if (active) setUser(data.user);
      })
      .catch(() => setUser(null));
    return () => {
      active = false;
    };
  }, []);

  const fetchLot = useCallback(
    () => apiGet<{ lots: Lot[] }>(`/api/lots`),
    []
  );
  const { data: lotsData } = usePolling(fetchLot, 10 * 60_000);
  const lot = useMemo(
    () => lotsData?.lots.find((l) => l.id === lotId),
    [lotsData, lotId]
  );

  const fetchSpots = useCallback(() => {
    const query = buildQuery(filters);
    return apiGet<{ spots: Spot[] }>(
      `/api/spots?lotId=${lotId}${query ? `&${query}` : ""}`
    );
  }, [lotId, filters]);

  const { data: spotsData, loading, refresh } = usePolling(fetchSpots, 30_000);

  const spots = spotsData?.spots ?? [];
  const selectedStillValid = selectedSpot
    ? spots.some((s) => s.id === selectedSpot.id)
    : false;

  const availableCount = spots.filter((s) => s.status === "AVAILABLE").length;

  function handleReservationDone() {
    void refresh();
    setSelectedSpot(null);
  }

  return (
    <main className="mx-auto max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <div className="mb-6">
        <Link
          href="/"
          className="text-sm font-medium text-teal-600 hover:underline"
        >
          ← All lots
        </Link>
        {lot && (
          <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h1 className="text-2xl font-bold text-slate-800">{lot.name}</h1>
              <p className="text-sm text-slate-500">{lot.address}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-slate-500">
                From{" "}
                <span className="font-semibold text-slate-700">
                  {formatCurrency(lot.baseHourlyRate)}
                </span>
                /hr ·{" "}
                <span
                  className={`font-semibold ${
                    availableCount > 0 ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {availableCount} available
                </span>
              </p>
              <Link
                href={`/spots/${lot.id}/navigate`}
                className="rounded-lg border border-teal-200 bg-white px-3 py-1.5 text-sm font-medium text-teal-700 hover:bg-teal-50"
              >
                Navigate ↗
              </Link>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <SearchFilters
            initial={filters}
            onChange={(next) => {
              setFilters(next);
              setSelectedSpot(null);
            }}
          />
        </aside>

        <div className="space-y-6">
          {loading && spots.length === 0 ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-48 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          ) : (
            <ParkingGrid
              spots={spots}
              selectedSpotId={selectedStillValid ? selectedSpot?.id : null}
              onSelect={setSelectedSpot}
            />
          )}

          {selectedStillValid && selectedSpot && (
            <div className="border-t border-slate-100 pt-6">
              <div className="mb-4 rounded-2xl bg-teal-50 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-teal-900">
                      Spot #{selectedSpot.number} selected
                    </h2>
                    <p className="mt-1 text-sm text-teal-700">
                      {selectedSpot.zone.name} · Floor {selectedSpot.zone.floor} ·{" "}
                      {selectedSpot.size.charAt(0) +
                        selectedSpot.size.slice(1).toLowerCase()}
                      {selectedSpot.evCharging && " · EV charging"}
                      {selectedSpot.accessible && " · Accessible"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-teal-700">Rate</p>
                    <p className="text-xl font-bold text-teal-900">
                      {formatCurrency(selectedSpot.pricePerHour)}/hr
                    </p>
                  </div>
                </div>
              </div>
              <ReservationForm
                spot={selectedSpot}
                user={user}
                onDone={handleReservationDone}
              />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}