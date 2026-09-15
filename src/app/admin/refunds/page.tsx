"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import AdminTabs from "@/components/AdminTabs";
import type { RefundPaymentRow, AuditEntry } from "@/lib/types";

export default function RefundsPage() {
  const [payments, setPayments] = useState<RefundPaymentRow[] | null>(null);
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    try {
      const [p, a] = await Promise.all([
        apiGet<{ payments: RefundPaymentRow[] }>("/api/admin/refunds"),
        apiGet<{ entries: AuditEntry[] }>("/api/admin/audit"),
      ]);
      setPayments(p.payments);
      setAudit(a.entries);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load refunds");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function refund(paymentId: string, amount: number) {
    setBusyId(paymentId);
    setMessage(null);
    try {
      await apiPost("/api/admin/refunds", {
        paymentId,
        amount: Math.round(amount * 100) / 100,
        reason: reason.trim() || "admin refund",
      });
      setMessage("Refund processed.");
      setReason("");
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Refund failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="mx-auto max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Refunds & audit</h1>
        <p className="mt-1 text-sm text-slate-500">
          Issue manual refunds against paid reservations and review the operator
          audit trail. Auto-refunds apply on cancellation.
        </p>
      </div>

      <AdminTabs />

      {message && (
        <div className="mb-4 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
          {message}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              <th className="px-5 py-3">Reservation</th>
              <th className="px-5 py-3">Customer / plate</th>
              <th className="px-5 py-3">Amount</th>
              <th className="px-5 py-3">Refunded</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {payments === null && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            )}
            {payments && payments.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                  No payments yet.
                </td>
              </tr>
            )}
            {payments?.map((p) => {
              const remaining = Math.max(
                0,
                p.amount - p.refundedAmount
              );
              const refundable = p.status === "PAID" || p.status === "PARTIALLY_REFUNDED";
              return (
                <tr key={p.id}>
                  <td className="px-5 py-3 text-slate-600">
                    <p>
                      {p.reservation.spot.zone.lot.name} · #{p.reservation.spot.number}
                    </p>
                    <p className="text-xs text-slate-400">
                      {formatDate(p.createdAt)} · {p.provider}
                    </p>
                  </td>
                  <td className="px-5 py-3">
                    <p className="font-medium text-slate-800">
                      {p.reservation.user?.name ?? "Guest"}
                    </p>
                    <p className="text-xs text-slate-400">
                      {p.reservation.user?.email}
                      {p.reservation.vehicle?.plateNumber
                        ? ` · ${p.reservation.vehicle.plateNumber}`
                        : ""}
                    </p>
                  </td>
                  <td className="px-5 py-3 font-medium text-slate-800">
                    {formatCurrency(p.amount)}
                  </td>
                  <td className="px-5 py-3 text-slate-600">
                    {p.refundedAmount > 0 ? formatCurrency(p.refundedAmount) : "—"}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        p.status === "REFUNDED"
                          ? "bg-slate-100 text-slate-500"
                          : p.status === "PARTIALLY_REFUNDED"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {refundable && remaining > 0 ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => refund(p.id, p.amount)}
                          disabled={busyId === p.id}
                          className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900 disabled:opacity-50"
                        >
                          Refund full
                        </button>
                        <button
                          onClick={() => refund(p.id, remaining / 2)}
                          disabled={busyId === p.id}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                        >
                          Refund half ({formatCurrency(remaining / 2)})
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-800">Reason for next refund</h2>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Optional refund reason (logged to audit trail)…"
          className="mt-2 w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 font-semibold text-slate-800">Audit trail</h2>
        <ul className="divide-y divide-slate-50">
          {audit === null && <p className="text-sm text-slate-400">Loading…</p>}
          {audit && audit.length === 0 && (
            <p className="text-sm text-slate-400">No audit entries yet.</p>
          )}
          {audit?.slice(0, 40).map((e) => (
            <li key={e.id} className="flex items-start gap-3 py-2.5 text-sm">
              <span className="mt-0.5 rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-500">
                {e.action}
              </span>
              <div className="min-w-0">
                <p className="truncate text-slate-700">{e.details}</p>
                <p className="text-xs text-slate-400">
                  {e.userRole ?? "system"} · {formatDate(e.createdAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}