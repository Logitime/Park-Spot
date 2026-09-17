"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import AdminTabs from "@/components/AdminTabs";

type GateSummary = {
  id: string;
  name: string;
  direction: string;
};

type ShiftEntry = {
  id: string;
  shiftId: string;
  shiftName: string;
  startTime: string;
  endTime: string;
  gateId: string;
  gateName: string;
};

type StaffUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  enabled: boolean;
  gateIds: string[];
  gates: GateSummary[];
  shifts: ShiftEntry[];
};

const EMPTY_FORM = {
  name: "",
  email: "",
  role: "OPERATOR",
  password: "",
  enabled: true,
  gateIds: [] as string[],
};

export default function UsersPage() {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [gates, setGates] = useState<GateSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [uData, gData] = await Promise.all([
        apiGet<{ users: StaffUser[] }>("/api/admin/users"),
        apiGet<{ gates: (GateSummary & { name: string })[] }>("/api/admin/gates"),
      ]);
      setUsers(uData.users);
      setGates(gData.gates);
      setError(null);
      setMessage(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, gateIds: [] });
    setFormOpen(true);
  };

  const openEdit = (u: StaffUser) => {
    setEditingId(u.id);
    setForm({
      name: u.name,
      email: u.email,
      role: u.role,
      password: "",
      enabled: u.enabled,
      gateIds: u.gateIds,
    });
    setFormOpen(true);
  };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId && form.password && form.password.length < 6) {
      setMessage("Password must be at least 6 characters");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      if (editingId) {
        const payload: Record<string, unknown> = {
          name: form.name,
          email: form.email,
          role: form.role,
          enabled: form.enabled,
          gateIds: form.gateIds,
        };
        if (form.password) payload.password = form.password;
        await apiPut(`/api/admin/users/${editingId}`, payload);
        setMessage("User updated.");
      } else {
        await apiPost("/api/admin/users", {
          ...form,
          password: form.password,
        });
        setMessage("User created.");
      }
      setFormOpen(false);
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const deleteUser = async (u: StaffUser) => {
    if (!window.confirm(`Delete user "${u.name}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await apiDelete(`/api/admin/users/${u.id}`);
      setMessage("User deleted.");
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  const toggleGate = (gateId: string) => {
    setForm((f) => ({
      ...f,
      gateIds: f.gateIds.includes(gateId)
        ? f.gateIds.filter((id) => id !== gateId)
        : [...f.gateIds, gateId],
    }));
  };

  const gateName = useMemo(() => {
    const map = new Map(gates.map((g) => [g.id, g]));
    return (id: string) => map.get(id)?.name ?? id;
  }, [gates]);

  return (
    <main className="mx-auto max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Users</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage OPERATOR / ADMIN accounts, gate access and shift rostering.
        </p>
      </div>

      <AdminTabs />

      {message && (
        <div className="mb-4 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
          {message}
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">{users.length} account(s)</p>
        <button
          onClick={openCreate}
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
        >
          + Add user
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-slate-500">{error}</p>
        </div>
      )}

      {users.length === 0 && !error && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-slate-400">No staff accounts yet. Add your first operator above.</p>
        </div>
      )}

      {users.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Gates</th>
                <th className="px-5 py-3">Shift roster</th>
                <th className="px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-5 py-3 font-medium text-slate-800">{u.name}</td>
                  <td className="px-5 py-3 text-slate-500">{u.email}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        u.role === "ADMIN"
                          ? "bg-violet-50 text-violet-700"
                          : "bg-sky-50 text-sky-700"
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        u.enabled
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-rose-50 text-rose-600"
                      }`}
                    >
                      {u.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {u.gates.length === 0 ? (
                      <span className="text-xs text-slate-400">—</span>
                    ) : (
                      <div className="flex max-w-xs flex-wrap gap-1">
                        {u.gates.map((g) => (
                          <span
                            key={g.id}
                            className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                          >
                            {g.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {u.shifts.length === 0 ? (
                      <span className="text-xs text-slate-400">—</span>
                    ) : (
                      <div className="flex max-w-xs flex-wrap gap-1">
                        {u.shifts.map((s) => (
                          <span
                            key={s.id}
                            className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700"
                            title={`${gateName(s.gateId)}`}
                          >
                            {s.shiftName} {s.startTime}–{s.endTime}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => openEdit(u)}
                        disabled={busy}
                        className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => void deleteUser(u)}
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

      {/* ─── Create / edit modal ────────────────────────────────────────── */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 pt-12 pb-12">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">
                {editingId ? "Edit user" : "Add user"}
              </h2>
              <button
                onClick={() => setFormOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={(e) => void submitForm(e)} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name" required>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="input"
                    placeholder="e.g. Ahmed Hassan"
                  />
                </Field>
                <Field label="Email" required>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="input"
                    placeholder="ahmed@parkspot.app"
                  />
                </Field>
                <Field label="Role">
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="input"
                  >
                    <option value="OPERATOR">OPERATOR</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                </Field>
                <Field label={editingId ? "Reset password (blank = keep)" : "Password"} required={!editingId}>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="input"
                    placeholder={editingId ? "Leave blank to keep current" : "Min 6 characters"}
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
                <span className="text-sm text-slate-700">
                  Account enabled (disabled users cannot log in)
                </span>
              </label>

              <Field label="Assigned gates">
                <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 p-2">
                  {gates.length === 0 && (
                    <p className="text-xs text-slate-400">
                      No gates configured yet. Add gates under Gate settings first.
                    </p>
                  )}
                  {gates.map((g) => {
                    const checked = form.gateIds.includes(g.id);
                    return (
                      <label
                        key={g.id}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleGate(g.id)}
                          className="rounded border-slate-300"
                        />
                        <span className="text-slate-700">{g.name}</span>
                        <span className="text-xs text-slate-400">({g.direction})</span>
                      </label>
                    );
                  })}
                </div>
              </Field>

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
                  disabled={
                    busy ||
                    !form.name.trim() ||
                    !form.email.trim() ||
                    (!editingId && form.password.length < 6)
                  }
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