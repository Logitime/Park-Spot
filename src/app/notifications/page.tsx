"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiPost, apiPatch } from "@/lib/api";
import type { AppNotification } from "@/lib/types";

const typeMeta: Record<string, { icon: string; label: string }> = {
  RESERVATION_PENDING: { icon: "💳", label: "Payment needed" },
  RESERVATION_CONFIRMED: { icon: "✅", label: "Confirmed" },
  RESERVATION_STARTED: { icon: "🅿️", label: "Checked in" },
  RESERVATION_COMPLETED: { icon: "🏁", label: "Completed" },
  RESERVATION_CANCELLED: { icon: "❌", label: "Cancelled" },
  RESERVATION_REMINDER: { icon: "⏰", label: "Reminder" },
  SPOT_RELEASED: { icon: "🟢", label: "Spot available" },
};

export default function NotificationsPage() {
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiGet<{ notifications: AppNotification[] }>(
        "/api/notifications"
      );
      setItems(data.notifications);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load notifications");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const toggleRead = async (n: AppNotification) => {
    setItems((list) =>
      list?.map((x) => (x.id === n.id ? { ...x, read: !x.read } : x)) ?? null
    );
    await apiPatch(`/api/notifications/${n.id}`, { read: !n.read }).catch(
      () => null
    );
  };

  const markAllRead = async () => {
    await apiPost("/api/notifications/read-all", {});
    setItems((list) => list?.map((x) => ({ ...x, read: true })) ?? null);
  };

  if (error && !items) {
    return (
      <main className="mx-auto flex max-w-3xl flex-1 flex-col items-center px-4 py-24 text-center">
        <h1 className="text-2xl font-bold text-slate-800">Notifications</h1>
        <p className="mt-3 text-slate-500">{error}</p>
        <Link
          href="/login"
          className="mt-6 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
        >
          Log in
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl flex-1 px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Notifications</h1>
          <p className="mt-1 text-sm text-slate-500">
            Booking updates, reminders, and payment alerts. Emails are sent to
            your account address when SMTP is configured.
          </p>
        </div>
        <button
          onClick={markAllRead}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Mark all read
        </button>
      </div>

      {items === null ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
          <h2 className="font-semibold text-slate-700">All caught up</h2>
          <p className="mt-2 text-sm text-slate-500">
            Booking updates will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((n) => {
            const meta = typeMeta[n.type] ?? { icon: "🔔", label: n.type };
            return (
              <button
                key={n.id}
                onClick={() => toggleRead(n)}
                className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition ${
                  n.read
                    ? "border-slate-200 bg-white opacity-70"
                    : "border-teal-200 bg-teal-50/60"
                }`}
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-lg shadow-sm">
                  {meta.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
                      {meta.label}
                    </p>
                    <p className="shrink-0 text-xs text-slate-400">
                      {new Date(n.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-slate-700">{n.content}</p>
                  {n.relatedId && (
                    <Link
                      href="/reservations"
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1 inline-block text-xs font-medium text-teal-600 hover:underline"
                    >
                      View booking →
                    </Link>
                  )}
                </div>
                {!n.read && (
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-teal-500" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </main>
  );
}