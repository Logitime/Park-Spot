"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { usePolling } from "@/lib/usePolling";
import { apiGet } from "@/lib/api";
import LotCard from "@/components/LotCard";
import type { Lot, LotAvailability } from "@/lib/types";

export default function Home() {
  const [search, setSearch] = useState("");

  useEffect(() => {
    void apiGet<{ user: { role: string } | null }>("/api/auth/me").then((d) => {
      if (d.user?.role === "OPERATOR") {
        window.location.replace("/admin/operator");
      }
    });
  }, []);

  const fetchLots = useCallback(
    () => apiGet<{ lots: Lot[] }>("/api/lots"),
    []
  );
  const { data: lotsData, loading } = usePolling(fetchLots, 60_000, "home_lots");

  const fetchAvailability = useCallback(
    () => apiGet<{ availability: LotAvailability[] }>("/api/availability"),
    []
  );
  const {
    data: availabilityData,
    loading: availabilityLoading,
  } = usePolling(fetchAvailability, 30_000, "home_availability");

  const availabilityMap = useMemo(() => {
    const map = new Map<string, LotAvailability>();
    for (const a of availabilityData?.availability ?? []) {
      map.set(a.lotId, a);
    }
    return map;
  }, [availabilityData]);

  const lots = useMemo(() => {
    const list = lotsData?.lots ?? [];
    const matches = search.trim()
      ? list.filter(
          (lot) =>
            lot.name.toLowerCase().includes(search.toLowerCase()) ||
            lot.address.toLowerCase().includes(search.toLowerCase())
        )
      : list;

    return matches.map((lot) => {
      const live = availabilityMap.get(lot.id);
      return live ? { ...lot, available: live.available } : lot;
    });
  }, [lotsData, availabilityMap, search]);

  const totalFree = useMemo(
    () =>
      (availabilityData?.availability ?? []).reduce(
        (sum, a) => sum + a.available,
        0
      ),
    [availabilityData]
  );

  return (
    <main className="flex-1 w-full max-w-full overflow-x-hidden">
      <section className="bg-gradient-to-br from-teal-600 via-teal-700 to-emerald-800 py-10 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="max-w-3xl">
            <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-teal-100">
              {!availabilityLoading && totalFree > 0
                ? `● ${totalFree} spots available right now`
                : "Live parking availability"}
            </span>
            <h1 className="mt-4 text-3xl font-bold leading-tight text-white sm:text-5xl">
              Find and reserve parking in seconds.
            </h1>
            <p className="mt-3 text-base sm:text-lg text-teal-100">
              See live availability, reserve your spot in advance, and avoid the
              search — at every lot we cover.
            </p>

            <form
              onSubmit={(e) => e.preventDefault()}
              className="mt-6 flex flex-col sm:flex-row max-w-xl gap-2 rounded-2xl bg-white p-2 shadow-xl"
            >
              <div className="flex flex-1 items-center gap-2 px-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-5 w-5 shrink-0 text-slate-400"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by lot name or location…"
                  className="w-full border-0 text-sm text-slate-800 focus:outline-none focus:ring-0"
                />
              </div>
              <button
                type="submit"
                className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 shrink-0"
              >
                Search
              </button>
            </form>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Available lots</h2>
            <p className="mt-1 text-sm text-slate-500">
              Live occupancy updates every 30 seconds
            </p>
          </div>
          {!availabilityLoading && (
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              ● Live
            </span>
          )}
        </div>

        {loading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-80 animate-pulse rounded-2xl bg-slate-100"
              />
            ))}
          </div>
        ) : lots.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center text-slate-500">
            No parking lots match your search.
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {lots.map((lot) => (
              <LotCard key={lot.id} lot={lot} />
            ))}
          </div>
        )}
      </section>

      <section className="border-t border-slate-100 bg-slate-50 py-16">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:grid-cols-3 sm:px-6">
          {[
            {
              title: "Live availability",
              desc: "Color-coded spot status that updates in real time so you never hunt for a free spot.",
            },
            {
              title: "Reserve ahead",
              desc: "Book a spot before you arrive with instant confirmation and a digital gate code.",
            },
            {
              title: "Smart pricing",
              desc: "Transparent hourly rates with clear peak, off-peak, and premium zone pricing.",
            },
          ].map((feature) => (
            <div key={feature.title} className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="mb-3 grid h-10 w-10 place-items-center rounded-lg bg-teal-100 text-teal-700">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-5 w-5"
                >
                  <path d="M5 11l1.5-4.5A2 2 0 018.4 5h7.2a2 2 0 011.9 1.5L19 11" />
                  <path d="M5 11v6h14v-6" />
                </svg>
              </div>
              <h3 className="font-semibold text-slate-800">{feature.title}</h3>
              <p className="mt-2 text-sm text-slate-500">{feature.desc}</p>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-12 max-w-7xl px-4 sm:px-6">
          <div className="rounded-2xl bg-teal-700 p-10 text-center text-white">
            <h2 className="text-2xl font-bold">
              Ready to skip the parking hunt?
            </h2>
            <p className="mt-2 text-teal-100">
              Create a free account and make your first reservation in minutes.
            </p>
            <Link
              href="/register"
              className="mt-6 inline-block rounded-xl bg-white px-6 py-3 font-semibold text-teal-700 hover:bg-teal-50"
            >
              Get started
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}