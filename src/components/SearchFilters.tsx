"use client";

import { useState } from "react";

export interface SpotFilters {
  status: string;
  sizes: string[];
  evCharging: boolean;
  accessible: boolean;
  maxPrice: string;
}

interface SearchFiltersProps {
  initial?: Partial<SpotFilters>;
  onChange: (filters: SpotFilters) => void;
  compact?: boolean;
}

export default function SearchFilters({
  initial,
  onChange,
  compact = false,
}: SearchFiltersProps) {
  const [filters, setFilters] = useState<SpotFilters>({
    status: initial?.status ?? "AVAILABLE",
    sizes: initial?.sizes ?? [],
    evCharging: initial?.evCharging ?? false,
    accessible: initial?.accessible ?? false,
    maxPrice: initial?.maxPrice ?? "",
  });

  function update(patch: Partial<SpotFilters>) {
    const next = { ...filters, ...patch };
    setFilters(next);
    onChange(next);
  }

  function toggleSize(size: string) {
    const sizes = filters.sizes.includes(size)
      ? filters.sizes.filter((s) => s !== size)
      : [...filters.sizes, size];
    update({ sizes });
  }

  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white p-4 ${
        compact ? "space-y-3" : "space-y-4"
      }`}
    >
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Spot Status
        </label>
        <select
          value={filters.status}
          onChange={(e) => update({ status: e.target.value })}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
        >
          <option value="AVAILABLE">Available</option>
          <option value="OCCUPIED">Occupied</option>
          <option value="RESERVED">Reserved</option>
          <option value="">All statuses</option>
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Spot Size
        </label>
        <div className="flex flex-wrap gap-2">
          {["COMPACT", "STANDARD", "LARGE"].map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => toggleSize(size)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                filters.sizes.includes(size)
                  ? "bg-teal-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-teal-50"
              }`}
            >
              {size.charAt(0) + size.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
          <input
            type="checkbox"
            checked={filters.evCharging}
            onChange={(e) => update({ evCharging: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
          />
          <span className="text-sm text-slate-700">EV Charging</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
          <input
            type="checkbox"
            checked={filters.accessible}
            onChange={(e) => update({ accessible: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
          />
          <span className="text-sm text-slate-700">Accessible</span>
        </label>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Max per hour ($)
        </label>
        <input
          type="number"
          min="0"
          step="0.5"
          value={filters.maxPrice}
          onChange={(e) => update({ maxPrice: e.target.value })}
          placeholder="No limit"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
        />
      </div>
    </div>
  );
}