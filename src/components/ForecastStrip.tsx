"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";

export interface HourForecast {
  hour: string;
  label: string;
  predictedAvailable: number;
  predictedOccupancyPct: number;
  confidence: "high" | "medium" | "low";
}

export interface ForecastResponse {
  lotId: string;
  totalSpots: number;
  availableNow: number;
  horizon: number;
  hours: HourForecast[];
}

function dotColor(pct: number) {
  if (pct < 65) return "bg-emerald-400";
  if (pct < 85) return "bg-amber-400";
  return "bg-rose-400";
}

export default function ForecastStrip({ lotId }: { lotId: string }) {
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    apiGet<ForecastResponse>(`/api/availability/forecast?lotId=${lotId}`)
      .then((d) => {
        if (active) {
          setData(d);
          setFailed(false);
        }
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [lotId]);

  if (failed || !data || data.hours.length === 0) return null;

  return (
    <div className="mt-4 rounded-2xl border border-slate-100 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-700">
          Expected availability
        </p>
        <p className="text-xs text-slate-400">
          {data.availableNow} free now · forecast for the next {data.horizon} hours
        </p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {data.hours.map((h) => (
          <div
            key={h.hour}
            className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
            title={`Predicted ${h.predictedAvailable} of ${data.totalSpots} free (${h.predictedOccupancyPct}% full)`}
          >
            <span className={`h-2 w-2 rounded-full ${dotColor(h.predictedOccupancyPct)}`} />
            <span className="text-xs font-semibold text-slate-700">{h.label}</span>
            <span className="text-xs text-slate-500">{h.predictedAvailable} free</span>
            <span className="text-[10px] uppercase tracking-wide text-slate-300">
              {h.confidence === "high"
                ? "· confident"
                : h.confidence === "medium"
                  ? "· likely"
                  : "· estimate"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}