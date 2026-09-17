"use client";

import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import AdminTabs from "@/components/AdminTabs";

type LotWithZones = {
  id: string;
  name: string;
  address: string;
  zones: {
    id: string;
    name: string;
    floor: number;
    priceMultiplier: number;
    _count: { spots: number; gates: number };
  }[];
};

const EMPTY_FORM = {
  lotId: "",
  name: "",
  floor: 0,
  priceMultiplier: 1,
};

export default function ZonesPage() {
  const [lots, setLots] = useState<LotWithZones[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiGet<{ lots: LotWithZones[] }>("/api/admin/zones");
      setLots(data.lots);
      setError(null);
      setMessage(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load zones");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      lotId: lots[0]?.id ?? "",
      name: "",
      floor: 0,
      priceMultiplier: 1,
    });
    setFormOpen(true);
  };

  const openEdit = (z: LotWithZones["zones"][number], lotId: string) => {
    setEditingId(z.id);
    setForm({
      lotId,
      name: z.name,
      floor: z.floor,
      priceMultiplier: z.priceMultiplier,
    });
    setFormOpen(true);
  };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      if (editingId) {
        await apiPut(`/api/admin/zones/${editingId}`, {
          name: form.name,
          floor: form.floor,
          priceMultiplier: form.priceMultiplier,
        });
        setMessage("Zone updated.");
      } else {
        await apiPost("/api/admin/zones", {
          lotId: form.lotId,
          name: form.name,
          floor: form.floor,
          priceMultiplier: form.priceMultiplier,
        });
        setMessage("Zone created.");
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const deleteZone = async (zoneId: string, name: string) => {
    if (!window.confirm(`Delete zone "${name}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await apiDelete(`/api/admin/zones/${zoneId}`);
      setMessage("Zone deleted.");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  const totalZones = lots.reduce((n, l) => n + l.zones.length, 0);

  return (
    <main className="mx-auto max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Zones</h1>
        <p className="mt-1 text-sm text-slate-500">
          Organize each parking lot into zones (floors / sections) with pricing.
        </p>
      </div>

      <AdminTabs />

      {message && (
        <div className="mb-4 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
          {message}
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {lots.length} lot(s) · {totalZones} zone(s)
        </p>
        <button
          onClick={openCreate}
          disabled={lots.length === 0}
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
        >
          + Add zone
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-slate-500">{error}</p>
        </div>
      )}

      {lots.length === 0 && !error && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-slate-400">No parking lots found.</p>
        </div>
      )}

      <div className="space-y-6">
        {lots.map((lot) => (
          <div key={lot.id} className="rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="font-semibold text-slate-800">{lot.name}</h2>
              <p className="text-xs text-slate-400">
                {lot.address} · {lot.zones.length} zone(s)
              </p>
            </div>
            {lot.zones.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-400">
                No zones in this lot yet.
              </p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-5 py-3">Name</th>
                    <th className="px-5 py-3">Floor</th>
                    <th className="px-5 py-3">Price ×</th>
                    <th className="px-5 py-3">Spots</th>
                    <th className="px-5 py-3">Gates</th>
                    <th className="px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {lot.zones.map((z) => (
                    <tr key={z.id}>
                      <td className="px-5 py-3 font-medium text-slate-800">{z.name}</td>
                      <td className="px-5 py-3 text-slate-500">{z.floor}</td>
                      <td className="px-5 py-3 text-slate-600">×{z.priceMultiplier}</td>
                      <td className="px-5 py-3 text-slate-500">{z._count.spots}</td>
                      <td className="px-5 py-3 text-slate-500">{z._count.gates}</td>
                      <td className="px-5 py-3">
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => openEdit(z, lot.id)}
                            disabled={busy}
                            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => void deleteZone(z.id, z.name)}
                            disabled={busy}
                            className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>

      {/* ─── Create / edit modal ────────────────────────────────────────── */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 pt-12 pb-12">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">
                {editingId ? "Edit zone" : "Add zone"}
              </h2>
              <button
                onClick={() => setFormOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={(e) => void submitForm(e)} className="space-y-4">
              {!editingId && (
                <Field label="Lot" required>
                  <select
                    value={form.lotId}
                    onChange={(e) => setForm({ ...form, lotId: e.target.value })}
                    className="input"
                  >
                    {lots.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              <Field label="Zone name" required>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input"
                  placeholder="e.g. Ground A"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Floor">
                  <input
                    type="number"
                    value={form.floor}
                    onChange={(e) => setForm({ ...form, floor: Number(e.target.value) })}
                    className="input"
                  />
                </Field>
                <Field label="Price multiplier">
                  <input
                    type="number"
                    min={0}
                    max={10}
                    step={0.05}
                    value={form.priceMultiplier}
                    onChange={(e) =>
                      setForm({ ...form, priceMultiplier: Number(e.target.value) })
                    }
                    className="input"
                  />
                </Field>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy || !form.name.trim() || !form.lotId}
                  className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                >
                  {busy ? "Saving…" : editingId ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}