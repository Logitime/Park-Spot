"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiPost } from "@/lib/api";
import { formatCurrency, formatDate, statusBadge } from "@/lib/utils";
import AdminTabs from "@/components/AdminTabs";

type AdminReservation = {
  id: string;
  qrCode: string | null;
  status: string;
  startTime: string;
  endTime: string;
  totalPrice: number;
  createdAt: string;
  user: { id: string; name: string; email: string };
  spot: { number: number; zone: string; lot: string };
  paid: boolean;
};

export default function GateAdminPage() {
  const [rows, setRows] = useState<AdminReservation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      const data = await apiGet<{ reservations: AdminReservation[] }>(
        `/api/admin/reservations?${params.toString()}`
      );
      setRows(data.reservations);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load reservations");
    }
  }, [statusFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const act = async (id: string, action: "checkin" | "checkout") => {
    setBusyId(id);
    setMessage(null);
    try {
      await apiPost(`/api/reservations/${id}/${action}`, {});
      setMessage(`${action === "checkin" ? "Checked in" : "Checked out"} reservation.`);
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  const matches = (r: AdminReservation) => {
    if (!q.trim()) return true;
    const needle = q.toLowerCase();
    return (
      r.user.name.toLowerCase().includes(needle) ||
      r.user.email.toLowerCase().includes(needle) ||
      (r.qrCode ?? "").toLowerCase().includes(needle) ||
      r.id.toLowerCase().includes(needle) ||
      r.spot.lot.toLowerCase().includes(needle)
    );
  };

  const filtered = (rows ?? []).filter(matches);

  return (
    <main className="mx-auto max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Entry & exit gate</h1>
        <p className="mt-1 text-sm text-slate-500">
          Verify reservations and manage check-in / check-out. Works with the
          QR code shown on the customer&apos;s phone.
        </p>
      </div>

      <AdminTabs />

      {message && (
        <div className="mb-4 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
          {message}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, email, QR code, lot…"
          className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          {["PENDING", "CONFIRMED", "ACTIVE", "COMPLETED", "CANCELLED"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            setQ("");
            setStatusFilter("");
          }}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          Clear
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-slate-500">{error}</p>
          <Link href="/login" className="mt-4 inline-block text-teal-600 hover:underline">
            Log in as operator / admin
          </Link>
        </div>
      )}

      {rows && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3">Lot / Spot</th>
                <th className="px-5 py-3">Window</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Paid</th>
                <th className="px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                    No reservations match.
                  </td>
                </tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="px-5 py-3">
                    <p className="font-medium text-slate-800">{r.user.name}</p>
                    <p className="text-xs text-slate-400">{r.user.email}</p>
                  </td>
                  <td className="px-5 py-3 text-slate-600">
                    <p>{r.spot.lot}</p>
                    <p className="text-xs text-slate-400">
                      #{r.spot.number} · {r.spot.zone}
                      {r.qrCode ? ` · ${r.qrCode}` : ""}
                    </p>
                  </td>
                  <td className="px-5 py-3 text-slate-600">
                    <p>{formatDate(r.startTime)}</p>
                    <p className="text-xs text-slate-400">{formatDate(r.endTime)}</p>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(r.status)}`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {r.paid ? (
                      <span className="text-sm font-medium text-emerald-600">
                        {formatCurrency(r.totalPrice)}
                      </span>
                    ) : (
                      <span className="text-sm text-rose-500">Unpaid</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex gap-2">
                      {r.status === "CONFIRMED" && (
                        <button
                          onClick={() => act(r.id, "checkin")}
                          disabled={busyId === r.id}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          Check in
                        </button>
                      )}
                      {r.status === "ACTIVE" && (
                        <button
                          onClick={() => act(r.id, "checkout")}
                          disabled={busyId === r.id}
                          className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900 disabled:opacity-50"
                        >
                          Check out
                        </button>
                      )}
                      {(r.status !== "CONFIRMED" && r.status !== "ACTIVE") && (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}