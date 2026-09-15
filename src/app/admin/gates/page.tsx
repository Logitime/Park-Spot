"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import AdminTabs from "@/components/AdminTabs";

type LotSummary = {
  id: string;
  name: string;
  zones: { id: string; name: string }[];
};

type OperatorSummary = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type Gate = {
  id: string;
  name: string;
  direction: string;
  enabled: boolean;
  cameraType: string;
  rtspUrl: string | null;
  usbDevice: number;
  roi: string | null;
  plcHost: string;
  plcPort: number;
  plcUnit: number;
  plcRegisters: string | null;
  openSeconds: number;
  lotId: string | null;
  zoneId: string | null;
  createdAt: string;
  lot: { id: string; name: string } | null;
  zone: { id: string; name: string } | null;
  operators: { id: string; name: string; email: string }[];
};

type PlcInputs = Record<string, boolean> | null;

const EMPTY_FORM = {
  name: "",
  direction: "ENTRY",
  cameraType: "rtsp",
  rtspUrl: "",
  usbDevice: 0,
  roi: "",
  plcHost: "",
  plcPort: 502,
  plcUnit: 1,
  openSeconds: 20,
  lotId: "",
  zoneId: "",
  operatorIds: [] as string[],
  plcRegisters: "",
};

export default function GateConfigPage() {
  const [gates, setGates] = useState<Gate[]>([]);
  const [lots, setLots] = useState<LotSummary[]>([]);
  const [operators, setOperators] = useState<OperatorSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // form state (create + edit share same shape)
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  // PLC diagnostics
  const [diagGateId, setDiagGateId] = useState<string | null>(null);
  const [diagInputs, setDiagInputs] = useState<PlcInputs>(null);
  const [diagBusy, setDiagBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [gData, lData, oData] = await Promise.all([
        apiGet<{ gates: Gate[] }>("/api/admin/gates"),
        apiGet<{ lots: LotSummary[] }>("/api/lots").catch(() => ({ lots: [] })),
        apiGet<{ users: OperatorSummary[] }>("/api/admin/users").catch(() => ({ users: [] })),
      ]);
      setGates(gData.gates);
      setLots(lData.lots);
      setOperators(oData.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load gates");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const selectedLot = useMemo(() => lots.find((l) => l.id === form.lotId) ?? null, [lots, form.lotId]);
  const zones = useMemo(() => selectedLot?.zones ?? [], [selectedLot]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, operatorIds: [] });
    setFormOpen(true);
    setMessage(null);
  };

  const openEdit = (g: Gate) => {
    setEditingId(g.id);
    setForm({
      name: g.name,
      direction: g.direction,
      cameraType: g.cameraType,
      rtspUrl: g.rtspUrl ?? "",
      usbDevice: g.usbDevice,
      roi: g.roi ?? "",
      plcHost: g.plcHost,
      plcPort: g.plcPort,
      plcUnit: g.plcUnit,
      openSeconds: g.openSeconds,
      lotId: g.lotId ?? "",
      zoneId: g.zoneId ?? "",
      operatorIds: g.operators.map((o) => o.id),
      plcRegisters: g.plcRegisters ?? "",
    });
    setFormOpen(true);
    setMessage(null);
  };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const payload = {
        ...form,
        lotId: form.lotId || null,
        zoneId: form.zoneId || null,
        plcRegisters: form.plcRegisters || null,
        roi: form.roi || null,
      };

      if (editingId) {
        await apiPut(`/api/admin/gates/${editingId}`, payload);
        setMessage("Gate updated.");
      } else {
        await apiPost("/api/admin/gates", payload);
        setMessage("Gate created.");
      }
      setFormOpen(false);
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const deleteGate = async (id: string) => {
    if (!window.confirm("Delete this gate? This cannot be undone.")) return;
    setBusy(true);
    try {
      await apiDelete(`/api/admin/gates/${id}`);
      setMessage("Gate deleted.");
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  const readPlc = async (gateId: string) => {
    setDiagBusy(true);
    setDiagInputs(null);
    setDiagGateId(gateId);
    try {
      const data = await apiPost<{ ok: boolean; inputs?: PlcInputs; error?: string }>(
        `/api/admin/gates/${gateId}/plc`,
        { action: "read" },
      );
      if (data.ok && data.inputs) {
        setDiagInputs(data.inputs);
      } else {
        setMessage(data.error ?? "PLC read failed");
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "PLC read failed");
    } finally {
      setDiagBusy(false);
    }
  };

  const writePlc = async (gateId: string, action: "open" | "close") => {
    setDiagBusy(true);
    setDiagGateId(gateId);
    try {
      const data = await apiPost<{ ok: boolean; inputs?: PlcInputs; error?: string }>(
        `/api/admin/gates/${gateId}/plc`,
        { action },
      );
      if (data.ok && data.inputs) {
        setDiagInputs(data.inputs);
      } else {
        setMessage(data.error ?? `PLC ${action} failed`);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : `PLC ${action} failed`);
    } finally {
      setDiagBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Gate settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Configure entry / exit gates: cameras, Siemens LOGO! PLC access,
          zones and operator assignments.
        </p>
      </div>

      <AdminTabs />

      {message && (
        <div className="mb-4 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
          {message}
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">{gates.length} gate(s) configured</p>
        <button
          onClick={openCreate}
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
        >
          + Add gate
        </button>
      </div>

      {/* ─── Gate table ────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-slate-500">{error}</p>
        </div>
      )}

      {gates.length === 0 && !error && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-slate-400">No gates configured yet. Add your first gate above.</p>
        </div>
      )}

      {gates.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Direction</th>
                <th className="px-5 py-3">Lot / Zone</th>
                <th className="px-5 py-3">Camera</th>
                <th className="px-5 py-3">PLC</th>
                <th className="px-5 py-3">Operators</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {gates.map((g) => (
                <tr key={g.id}>
                  <td className="px-5 py-3 font-medium text-slate-800">{g.name}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        g.direction === "ENTRY"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-indigo-50 text-indigo-700"
                      }`}
                    >
                      {g.direction}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-600">
                    {g.lot?.name ?? "—"}
                    {g.zone ? ` / ${g.zone.name}` : ""}
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-500">
                    {g.cameraType === "rtsp" ? (
                      <span title={g.rtspUrl ?? ""}>RTSP</span>
                    ) : (
                      <span>USB #{g.usbDevice}</span>
                    )}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-slate-500">
                    {g.plcHost}:{g.plcPort} u{g.plcUnit}
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-500">
                    {g.operators.length === 0
                      ? "—"
                      : g.operators.map((o) => o.name).join(", ")}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        g.enabled
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {g.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => openEdit(g)}
                        disabled={busy}
                        className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => void readPlc(g.id)}
                        disabled={diagBusy}
                        className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      >
                        Read PLC
                      </button>
                      <button
                        onClick={() => void writePlc(g.id, "open")}
                        disabled={diagBusy}
                        className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                      >
                        Open
                      </button>
                      <button
                        onClick={() => void writePlc(g.id, "close")}
                        disabled={diagBusy}
                        className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                      >
                        Close
                      </button>
                      <button
                        onClick={() => void deleteGate(g.id)}
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

      {/* ─── PLC diagnostics panel ──────────────────────────────────────── */}
      {diagGateId && diagInputs && (
        <div className="mt-6 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5">
          <h2 className="mb-3 font-semibold text-slate-800">
            PLC read: {gates.find((g) => g.id === diagGateId)?.name ?? diagGateId}
          </h2>
          <div className="flex flex-wrap gap-3">
            {Object.entries(diagInputs).map(([name, val]) => (
              <div
                key={name}
                className="flex items-center gap-2 rounded-lg border border-white bg-white px-3 py-2 shadow-sm"
              >
                <span
                  className={`inline-block h-3 w-3 rounded-full ${val ? "bg-emerald-500" : "bg-slate-300"}`}
                />
                <span className="text-xs font-medium text-slate-600">{name}</span>
                <span className="text-xs text-slate-400">{val ? "HIGH" : "LOW"}</span>
              </div>
            ))}
          </div>
          <button
            onClick={() => setDiagGateId(null)}
            className="mt-3 text-xs text-slate-400 hover:text-slate-600"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ─── Create / edit form modal ───────────────────────────────────── */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 pt-12 pb-12">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">
                {editingId ? "Edit gate" : "Add gate"}
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
                <Field label="Gate name" required>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="input"
                    placeholder="e.g. Entry A"
                  />
                </Field>

                <Field label="Direction">
                  <select
                    value={form.direction}
                    onChange={(e) => setForm({ ...form, direction: e.target.value })}
                    className="input"
                  >
                    <option value="ENTRY">ENTRY</option>
                    <option value="EXIT">EXIT</option>
                  </select>
                </Field>

                <Field label="Camera type">
                  <select
                    value={form.cameraType}
                    onChange={(e) => setForm({ ...form, cameraType: e.target.value })}
                    className="input"
                  >
                    <option value="rtsp">RTSP (IP camera)</option>
                    <option value="usb">USB (local device)</option>
                  </select>
                </Field>

                {form.cameraType === "rtsp" ? (
                  <Field label="RTSP URL">
                    <input
                      value={form.rtspUrl}
                      onChange={(e) => setForm({ ...form, rtspUrl: e.target.value })}
                      className="input"
                      placeholder="rtsp://admin:pass@192.168.1.64/..."
                    />
                  </Field>
                ) : (
                  <Field label="USB device index">
                    <input
                      type="number"
                      min={0}
                      value={form.usbDevice}
                      onChange={(e) => setForm({ ...form, usbDevice: Number(e.target.value) })}
                      className="input"
                    />
                  </Field>
                )}

                <Field label="PLC host" required>
                  <input
                    value={form.plcHost}
                    onChange={(e) => setForm({ ...form, plcHost: e.target.value })}
                    className="input"
                    placeholder="192.168.0.10"
                  />
                </Field>
                <Field label="PLC port">
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={form.plcPort}
                    onChange={(e) => setForm({ ...form, plcPort: Number(e.target.value) })}
                    className="input"
                  />
                </Field>
                <Field label="PLC unit">
                  <input
                    type="number"
                    min={0}
                    max={255}
                    value={form.plcUnit}
                    onChange={(e) => setForm({ ...form, plcUnit: Number(e.target.value) })}
                    className="input"
                  />
                </Field>
                <Field label="Open timeout (sec)">
                  <input
                    type="number"
                    min={5}
                    max={120}
                    step={1}
                    value={form.openSeconds}
                    onChange={(e) => setForm({ ...form, openSeconds: Number(e.target.value) })}
                    className="input"
                  />
                </Field>

                <Field label="Lot">
                  <select
                    value={form.lotId}
                    onChange={(e) => setForm({ ...form, lotId: e.target.value, zoneId: "" })}
                    className="input"
                  >
                    <option value="">— any lot —</option>
                    {lots.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Zone">
                  <select
                    value={form.zoneId}
                    onChange={(e) => setForm({ ...form, zoneId: e.target.value })}
                    className="input"
                    disabled={!form.lotId}
                  >
                    <option value="">— any zone —</option>
                    {zones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              {/* Operator multi-select */}
              <Field label="Assigned operators">
                <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 p-2">
                  {operators.length === 0 && (
                    <p className="text-xs text-slate-400">No OPERATOR/ADMIN users found.</p>
                  )}
                  {operators.map((op) => {
                    const checked = form.operatorIds.includes(op.id);
                    return (
                      <label
                        key={op.id}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setForm({
                              ...form,
                              operatorIds: checked
                                ? form.operatorIds.filter((id) => id !== op.id)
                                : [...form.operatorIds, op.id],
                            })
                          }
                          className="rounded border-slate-300"
                        />
                        <span className="text-slate-700">{op.name}</span>
                        <span className="text-xs text-slate-400">({op.email})</span>
                      </label>
                    );
                  })}
                </div>
              </Field>

              <Field label="ROI (normalized x1,y1,x2,y2)">
                <input
                  value={form.roi}
                  onChange={(e) => setForm({ ...form, roi: e.target.value })}
                  className="input"
                  placeholder='[0, 0, 1, 1]'
                />
              </Field>

              <Field label="PLC register map (JSON — leave empty for defaults)">
                <textarea
                  value={form.plcRegisters}
                  onChange={(e) => setForm({ ...form, plcRegisters: e.target.value })}
                  className="input h-24 resize-y font-mono text-xs"
                  placeholder='{"loop1":{"kind":"discrete","address":0}, "loop2":{"kind":"discrete","address":1}, "gateOpenSensor":{"kind":"discrete","address":2}, "open":{"kind":"coil","address":0}}'
                />
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
                  disabled={busy || !form.name.trim() || !form.plcHost.trim()}
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
