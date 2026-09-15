"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPut } from "@/lib/api";
import type { PolicySettings } from "@/lib/types";

export default function PolicyPanel() {
  const [policy, setPolicy] = useState<PolicySettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    apiGet<{ policy: PolicySettings }>("/api/admin/settings")
      .then((d) => setPolicy(d.policy))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load policy"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!policy) return null;

  const set = (key: keyof PolicySettings, raw: string) => {
    const next: Record<string, unknown> = { ...policy };
    if (key === "partialRefundEnabled") {
      next[key] = raw === "true";
    } else {
      next[key] = Number(raw);
    }
    setPolicy(next as unknown as PolicySettings);
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await apiPut("/api/admin/settings", policy);
      setMessage("Policy saved. The automation sweep reads these on every run.");
    } catch (e) {
      setMessage(e instanceof Error ? `Error: ${e.message}` : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 animate-rise rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-900/5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-slate-800">Automation policy</h2>
          <p className="text-xs text-slate-400">
            Timetable that drives the maintenance sweep and refund behavior.
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save policy"}
        </button>
      </div>

      {message && (
        <div
          className={`mb-3 rounded-xl border px-4 py-3 text-sm ${
            message.startsWith("Error")
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-teal-200 bg-teal-50 text-teal-800"
          }`}
        >
          {message}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <NumberField
          label="Auto-cancel unpaid after (min)"
          value={policy.pendingCancelMinutes}
          onChange={(v) => set("pendingCancelMinutes", v)}
        />
        <NumberField
          label="No-show release after (min)"
          value={policy.noShowGraceMinutes}
          onChange={(v) => set("noShowGraceMinutes", v)}
        />
        <NumberField
          label="Auto-complete after (min)"
          value={policy.autoCompleteMinutes}
          onChange={(v) => set("autoCompleteMinutes", v)}
        />
        <NumberField
          label="Free cancellation window (min)"
          value={policy.freeCancelMinutes}
          onChange={(v) => set("freeCancelMinutes", v)}
        />
        <label className="flex items-center justify-between rounded-xl border border-slate-100 p-3">
          <span className="text-sm text-slate-600">Partial early-exit refunds</span>
          <input
            type="checkbox"
            checked={policy.partialRefundEnabled}
            onChange={(e) => set("partialRefundEnabled", String(e.target.checked))}
            className="h-4 w-4 accent-teal-600"
          />
        </label>
        <NumberField
          label="Surge high-occupancy %"
          value={policy.surgeHighOccupancy}
          onChange={(v) => set("surgeHighOccupancy", v)}
        />
        <NumberField
          label="Surge multiplier min"
          value={policy.surgeMinMultiplier}
          step="0.1"
          onChange={(v) => set("surgeMinMultiplier", v)}
        />
        <NumberField
          label="Surge multiplier max"
          value={policy.surgeMaxMultiplier}
          step="0.1"
          onChange={(v) => set("surgeMaxMultiplier", v)}
        />
      </div>
      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
    </div>
  );
}

function NumberField({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number;
  step?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block rounded-xl border border-slate-100 p-3">
      <span className="text-sm text-slate-600">{label}</span>
      <input
        type="number"
        value={value}
        step={step ?? "1"}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
    </label>
  );
}