"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import AdminTabs from "@/components/AdminTabs";

type StaffUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  enabled: boolean;
  gateIds: string[];
};

type Gate = {
  id: string;
  name: string;
  direction: string;
  enabled: boolean;
  lot: { id: string; name: string } | null;
  operators: { id: string; name: string; email: string }[];
};

type ShiftAssignment = {
  id: string;
  userId: string;
  gateId: string;
  user: { id: string; name: string; email: string; role: string };
  gate: { id: string; name: string; direction: string };
};

type Shift = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  enabled: boolean;
  createdAt: string;
  assignments: ShiftAssignment[];
};

const EMPTY_FORM = {
  name: "",
  startTime: "08:00",
  endTime: "16:00",
  enabled: true,
};

export default function ShiftsPage() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [gates, setGates] = useState<Gate[]>([]);
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  // Roster editor: gateId -> selected userId[]
  const [assignShift, setAssignShift] = useState<Shift | null>(null);
  const [roster, setRoster] = useState<Record<string, string[]>>({});
  const [rosterBusy, setRosterBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [sData, gData, uData] = await Promise.all([
        apiGet<{ shifts: Shift[] }>("/api/admin/shifts"),
        apiGet<{ gates: Gate[] }>("/api/admin/gates"),
        apiGet<{ users: StaffUser[] }>("/api/admin/users"),
      ]);
      setShifts(sData.shifts);
      setGates(gData.gates);
      setUsers(uData.users);
      setError(null);
      setMessage(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load shifts");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setFormOpen(true);
  };

  const openEdit = (s: Shift) => {
    setEditingId(s.id);
    setForm({
      name: s.name,
      startTime: s.startTime,
      endTime: s.endTime,
      enabled: s.enabled,
    });
    setFormOpen(true);
  };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const payload = {
        name: form.name,
        startTime: form.startTime,
        endTime: form.endTime,
        enabled: form.enabled,
      };
      if (editingId) {
        await apiPut(`/api/admin/shifts/${editingId}`, payload);
        setMessage("Shift updated.");
      } else {
        await apiPost("/api/admin/shifts", payload);
        setMessage("Shift created.");
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const deleteShift = async (s: Shift) => {
    if (!window.confirm(`Delete shift "${s.name}"? Rosters for this shift will be cleared.`)) return;
    setBusy(true);
    try {
      await apiDelete(`/api/admin/shifts/${s.id}`);
      setMessage("Shift deleted.");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  // ── Roster editor ─────────────────────────────────────────────────────
  const openAssign = (s: Shift) => {
    const initial: Record<string, string[]> = {};
    for (const a of s.assignments) {
      (initial[a.gateId] ??= []).push(a.userId);
    }
    setAssignShift(s);
    setRoster(initial);
  };

  const toggleUser = (gateId: string, userId: string) => {
    setRoster((r) => {
      const current = r[gateId] ?? [];
      const next = current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId];
      return { ...r, [gateId]: next };
    });
  };

  const saveRoster = async () => {
    if (!assignShift) return;
    setRosterBusy(true);
    setMessage(null);
    try {
      const pairs: { userId: string; gateId: string }[] = [];
      for (const [gateId, userIds] of Object.entries(roster)) {
        for (const userId of userIds) pairs.push({ userId, gateId });
      }
      await apiPut(`/api/admin/shifts/${assignShift.id}/assignments`, { assignments: pairs });
      setMessage("Roster saved.");
      setAssignShift(null);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setRosterBusy(false);
    }
  };

  const groupedGates = useMemo(() => {
    const groups: { lot: string; gates: Gate[] }[] = [];
    const map = new Map<string, Gate[]>();
    for (const g of gates) {
      const lotName = g.lot?.name ?? "Unsigned";
      if (!map.has(lotName)) map.set(lotName, []);
      map.get(lotName)!.push(g);
    }
    for (const [lot, lotGates] of map) {
      groups.push({ lot, gates: lotGates });
    }
    return groups;
  }, [gates]);

  const rosterCount = (s: Shift) => {
    const distinctUsers = new Set(s.assignments.map((a) => a.userId));
    return `${s.assignments.length} assignment(s) · ${distinctUsers.size} operator(s)`;
  };

  return (
    <main className="mx-auto max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Shifts &amp; staffing</h1>
        <p className="mt-1 text-sm text-slate-500">
          Define work shifts and roster operators onto each gate per shift.
        </p>
      </div>

      <AdminTabs />

      {message && (
        <div className="mb-4 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
          {message}
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">{shifts.length} shift(s)</p>
        <button
          onClick={openCreate}
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
        >
          + Add shift
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-slate-500">{error}</p>
        </div>
      )}

      {shifts.length === 0 && !error && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-slate-400">No shifts defined yet. Add your first shift above.</p>
        </div>
      )}

      {shifts.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-3">Shift</th>
                <th className="px-5 py-3">Time</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Roster</th>
                <th className="px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {shifts.map((s) => (
                <tr key={s.id}>
                  <td className="px-5 py-3 font-medium text-slate-800">{s.name}</td>
                  <td className="px-5 py-3 font-mono text-xs text-slate-600">
                    {s.startTime} – {s.endTime}
                    {s.endTime <= s.startTime ? " (+1 day)" : ""}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        s.enabled
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {s.enabled ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-500">{rosterCount(s)}</td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => openAssign(s)}
                        disabled={busy || gates.length === 0 || users.length === 0}
                        className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                      >
                        Assign staff
                      </button>
                      <button
                        onClick={() => openEdit(s)}
                        disabled={busy}
                        className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => void deleteShift(s)}
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
        </div>
      )}

      {/* ─── Create / edit shift modal ──────────────────────────────────── */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 pt-12 pb-12">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">
                {editingId ? "Edit shift" : "Add shift"}
              </h2>
              <button
                onClick={() => setFormOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={(e) => void submitForm(e)} className="space-y-4">
              <Field label="Shift name" required>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input"
                  placeholder="e.g. Morning"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Start (HH:MM)">
                  <input
                    type="time"
                    value={form.startTime}
                    onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                    className="input"
                  />
                </Field>
                <Field label="End (HH:MM)">
                  <input
                    type="time"
                    value={form.endTime}
                    onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                    className="input"
                  />
                </Field>
              </div>

              <label className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                  className="rounded border-slate-300"
                />
                <span className="text-sm text-slate-700">Shift active</span>
              </label>

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
                  disabled={busy || !form.name.trim() || !form.startTime || !form.endTime}
                  className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                >
                  {busy ? "Saving…" : editingId ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Assign staff modal (per gate, per shift) ───────────────────── */}
      {assignShift && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 pt-12 pb-12">
          <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">
                Roster — {assignShift.name}
              </h2>
              <button
                onClick={() => setAssignShift(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <p className="mb-4 text-xs text-slate-400">
              {assignShift.startTime} – {assignShift.endTime}. Tick operators that cover
              each gate during this shift.
            </p>

            <div className="max-h-[55vh] space-y-5 overflow-y-auto pr-1">
              {groupedGates.length === 0 && (
                <p className="text-sm text-slate-400">No gates configured yet.</p>
              )}
              {groupedGates.map((group) => (
                <div
                  key={group.lot}
                  className="rounded-xl border border-slate-200 p-3"
                >
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {group.lot}
                  </h3>
                  <div className="space-y-3">
                    {group.gates.map((g) => (
                      <div
                        key={g.id}
                        className="rounded-lg border border-slate-100 bg-slate-50/50 p-3"
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-700">{g.name}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              g.direction === "ENTRY"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-indigo-50 text-indigo-700"
                            }`}
                          >
                            {g.direction}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {users.map((u) => {
                            const checked = (roster[g.id] ?? []).includes(u.id);
                            return (
                              <button
                                key={u.id}
                                type="button"
                                onClick={() => toggleUser(g.id, u.id)}
                                className={`rounded-full border px-2.5 py-1 text-xs transition ${
                                  checked
                                    ? "border-teal-500 bg-teal-600 text-white"
                                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                }`}
                              >
                                {u.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                onClick={() => setAssignShift(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => void saveRoster()}
                disabled={rosterBusy}
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {rosterBusy ? "Saving…" : "Save roster"}
              </button>
            </div>
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