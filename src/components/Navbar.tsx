"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { apiGet, apiPost, apiPatch } from "@/lib/api";
import type { User, AppNotification } from "@/lib/types";

const typeIcon: Record<string, string> = {
  RESERVATION_PENDING: "💳",
  RESERVATION_CONFIRMED: "✅",
  RESERVATION_STARTED: "🅿️",
  RESERVATION_COMPLETED: "🏁",
  RESERVATION_CANCELLED: "❌",
  RESERVATION_REMINDER: "⏰",
  SPOT_RELEASED: "🟢",
};

function NotificationBell() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiGet<{
        notifications: AppNotification[];
        unreadCount: number;
      }>("/api/notifications");
      setItems(data.notifications.slice(0, 8));
      setUnread(data.unreadCount);
    } catch {
      /* not signed in */
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const markRead = async (n: AppNotification) => {
    if (!n.read) {
      setUnread((u) => Math.max(0, u - 1));
      setItems((list) =>
        list.map((x) => (x.id === n.id ? { ...x, read: true } : x))
      );
      await apiPatch(`/api/notifications/${n.id}`, { read: true }).catch(
        () => null
      );
    }
  };

  const markAllRead = async () => {
    await apiPost("/api/notifications/read-all", {}).catch(() => null);
    setItems((list) => list.map((x) => ({ ...x, read: true })));
    setUnread(0);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-50"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="h-5 w-5"
        >
          <path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 003.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-800">Notifications</p>
            <div className="flex items-center gap-2">
              <button
                onClick={markAllRead}
                className="text-xs font-medium text-teal-600 hover:underline"
              >
                Mark all read
              </button>
            </div>
          </div>

          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">
              No notifications yet.
            </p>
          ) : (
            <div className="max-h-72 divide-y divide-slate-50 overflow-y-auto">
              {items.map((n) => (
                <Link
                  key={n.id}
                  href={n.relatedId ? "/reservations" : "/notifications"}
                  onClick={() => markRead(n)}
                  className={`block px-4 py-3 text-sm hover:bg-slate-50 ${
                    n.read ? "opacity-60" : ""
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 text-base">
                      {typeIcon[n.type] ?? "🔔"}
                    </span>
                    <div className="min-w-0">
                      <p className="text-slate-700">{n.content}</p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {new Date(n.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-slate-100 px-4 py-2.5 text-center text-xs font-medium text-teal-600 hover:bg-teal-50"
          >
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const loadUser = useCallback(async () => {
    try {
      const data = await apiGet<{ user: User | null }>("/api/auth/me");
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadUser();
  }, [loadUser, pathname]);

  async function handleLogout() {
    await apiPost("/api/auth/logout", {});
    setUser(null);
    router.push("/");
    router.refresh();
  }

  const links = [
    { href: "/", label: "Find Parking" },
    ...(user ? [{ href: "/reservations", label: "My Bookings" }] : []),
    ...(user && user.role !== "USER"
      ? [{ href: "/admin", label: "Dashboard" }]
      : []),
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-teal-100 bg-white/90 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-teal-600 text-white">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-5 w-5"
            >
              <path d="M5 11l1.5-4.5A2 2 0 018.4 5h7.2a2 2 0 011.9 1.5L19 11" />
              <path d="M5 11v6h14v-6" />
              <rect x="3" y="11" width="18" height="4" rx="1" />
              <circle cx="7.5" cy="13.5" r="0.5" fill="currentColor" />
              <circle cx="16.5" cy="13.5" r="0.5" fill="currentColor" />
            </svg>
          </div>
          <span className="text-lg font-bold text-teal-900">ParkSpot</span>
        </Link>

        <div className="flex items-center gap-1 sm:gap-2">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                pathname === link.href
                  ? "bg-teal-50 text-teal-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-teal-700"
              }`}
            >
              {link.label}
            </Link>
          ))}

          {loading ? null : user ? (
            <div className="flex items-center gap-2">
              <span className="hidden rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700 sm:block">
                {user.name.split(" ")[0]}
              </span>
              <NotificationBell />
              <button
                onClick={handleLogout}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Logout
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Log in
              </Link>
              <Link
                href="/register"
                className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700"
              >
                Sign up
              </Link>
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}