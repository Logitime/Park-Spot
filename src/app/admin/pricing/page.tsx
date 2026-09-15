"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import AdminTabs from "@/components/AdminTabs";
import type { PricingConfig, PricingZone, PricingRule } from "@/lib/types";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const formatHour = (h: number) => {
  const period = h < 12 ? "am" : "pm";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:00${period}`;
};

export default function PricingAdminPage() {
  const [data, setData] = useState<PricingConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const [selectedZone, setSelectedZone] = useState<string>("");
  const [name, setName] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState<string>("");
  const [startHour, setStartHour] = useState("16");
  const [endHour, setEndHour] = useState("19");
  const [multiplier, setMultiplier] = useState("1.2");

  const reload = useCallback(() => {
    apiGet<PricingConfig>("/api/admin/pricing")
      .then((d) => {
        setData(d);
        if (!selectedZone && d.zones.length) setSelectedZone(d.zones[0].id);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load pricing")
      )
      .finally(() => setLoading(false));
  }, [selectedZone]);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    try {
      const body = {
        zoneId: selectedZone,
        name,
        dayOfWeek: dayOfWeek === "" ? null : Number(dayOfWeek),
        startHour: Number(startHour),
        endHour: Number(endHour),
        multiplier: Number(multiplier),
      };
      if (body.endHour <= body.startHour) {
        throw new Error("End hour must be after start hour");
      }
      if (!body.name.trim()) throw new Error("Name is required");
      await apiPost<{ rule: PricingRule }>("/api/admin/pricing", body);
      setName("");
      setMultiplier("1.2");
      setMessage("Rule created. It now applies to new reservations.");
      reload();
    } catch (err) {
      setMessage(
        err instanceof Error ? `Error: ${err.message}` : "Failed to create rule"
      );
    }
  };

  const deleteRule = async (rule: PricingRule) => {
    if (!confirm(`Delete rule "${rule.name}"?`)) return;
    setMessage(null);
    try {
      await apiDelete(`/api/admin/pricing/${rule.id}`);
      setMessage("Rule deleted.");
      reload();
    } catch (err) {
      setMessage(
        err instanceof Error ? `Error: ${err.message}` : "Failed to delete rule"
      );
    }
  };

  const toggleDay = async (zoneId: string, rule: PricingRule) => {
    try {
      await apiPut(
        `/api/admin/pricing/${rule.id}`,
        { dayOfWeek: rule.dayOfWeek === null ? 0 : null }
      );
      reload();
    } catch (err) {
      setMessage(
        err instanceof Error ? `Error: ${err.message}` : "Failed to update rule"
      );
    }
  };

  const currentZone = data?.zones.find((z) => z.id === selectedZone);

  return (
    <main className="mx-auto max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Dynamic pricing</h1>
        <p className="mt-1 text-sm text-slate-500">
          Configure peak / off-peak multipliers per zone. Rules apply to the
          hours a reservation covers.
        </p>
      </div>

      <AdminTabs />

      {message && (
        <div className="mb-4 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
          {message}
        </div>
      )}

      {loading && (
        <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />
      )}

      {error && !loading && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-slate-500">{error}</p>
          <Link href="/login" className="mt-4 inline-block text-teal-600 hover:underline">
            Log in as operator / admin
          </Link>
        </div>
      )}

      {data && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            {data.zones.map((zone) => (
              <ZoneCard
                key={zone.id}
                zone={zone}
                dayNames={data.dayNames}
                onDelete={deleteRule}
                onToggleDay={toggleDay}
              />
            ))}
          </div>

          <div className="h-fit rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="font-semibold text-slate-800">New pricing rule</h2>
            <p className="mt-1 text-xs text-slate-400">
              Peak / off-peak window for a zone.
            </p>
            <form onSubmit={createRule} className="mt-4 space-y-4">
              <label className="block">
                <span className="text-sm text-slate-600">Zone</span>
                <select
                  value={selectedZone}
                  onChange={(e) => setSelectedZone(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {data.zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.lot.name} — {z.name}
                    </option>
                  ))}
                </select>
              </label>
              {currentZone && (
                <p className="text-xs text-slate-400">
                  Base hourly:{" "}
                  {currentZone.priceMultiplier.toFixed(2)}x zone multiplier ·{" "}
                  {currentZone.spotCount} spots
                </p>
              )}
              <label className="block">
                <span className="text-sm text-slate-600">Rule name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Evening peak"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-sm text-slate-600">Days</span>
                  <select
                    value={dayOfWeek}
                    onChange={(e) => setDayOfWeek(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="">Every day</option>
                    {DAYS.map((d, i) => (
                      <option key={d} value={i}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm text-slate-600">Multiplier</span>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="10"
                    value={multiplier}
                    onChange={(e) => setMultiplier(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-sm text-slate-600">Start hour</span>
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={startHour}
                    onChange={(e) => setStartHour(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-sm text-slate-600">End hour</span>
                  <input
                    type="number"
                    min="1"
                    max="24"
                    value={endHour}
                    onChange={(e) => setEndHour(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
              </div>
              <button
                type="submit"
                className="w-full rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
              >
                Add rule
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

function ZoneCard({
  zone,
  dayNames,
  onDelete,
  onToggleDay,
}: {
  zone: PricingZone;
  dayNames: string[];
  onDelete: (rule: PricingRule) => void;
  onToggleDay: (zoneId: string, rule: PricingRule) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 p-5">
        <div>
          <p className="font-semibold text-slate-800">{zone.name}</p>
          <p className="text-xs text-slate-400">
            {zone.lot.name} · Floor {zone.floor} · {zone.spotCount} spots
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
          base {zone.priceMultiplier.toFixed(2)}x
        </span>
      </div>
      {zone.rules.length === 0 ? (
        <p className="p-5 text-sm text-slate-400">
          No pricing rules. Flat rate applies.
        </p>
      ) : (
        <div className="divide-y divide-slate-50">
          {zone.rules.map((rule) => (
            <div
              key={rule.id}
              className="flex flex-wrap items-center gap-3 p-5"
            >
              <div className="min-w-[140px] flex-1">
                <p className="font-medium text-slate-800">{rule.name}</p>
                <p className="text-xs text-slate-400">
                  {rule.dayOfWeek === null
                    ? "Every day"
                    : dayNames[rule.dayOfWeek]}
                  {" · "}
                  {formatHour(rule.startHour)} – {formatHour(rule.endHour)}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-sm font-bold ${
                  rule.multiplier >= 1
                    ? "bg-amber-100 text-amber-700"
                    : "bg-sky-100 text-sky-700"
                }`}
              >
                {rule.multiplier.toFixed(2)}x
              </span>
              <button
                onClick={() => onToggleDay(zone.id, rule)}
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                title={rule.dayOfWeek === null ? "Restrict to Monday only" : "Apply every day"}
              >
                {rule.dayOfWeek === null ? "Every day" : dayNames[rule.dayOfWeek]}
              </button>
              <button
                onClick={() => onDelete(rule)}
                className="rounded-lg border border-rose-200 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}