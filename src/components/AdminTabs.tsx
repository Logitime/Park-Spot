"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { apiGet } from "@/lib/api";

const SETTINGS_PATHS = new Set([
  "/admin/settings",
  "/admin/operations",
  "/admin/users",
  "/admin/zones",
  "/admin/shifts",
  "/admin/gate",
  "/admin/gates",
  "/admin/pricing",
  "/admin/refunds",
]);

const SETTINGS_TABS = [
  { href: "/admin/settings", label: "Overview", exact: true },
  { href: "/admin/operations", label: "Operations" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/zones", label: "Zones" },
  { href: "/admin/shifts", label: "Shifts" },
  { href: "/admin/gate", label: "Entry & Exit Gate" },
  { href: "/admin/gates", label: "Gate Config" },
  { href: "/admin/pricing", label: "Dynamic Pricing" },
  { href: "/admin/refunds", label: "Refunds & Audit" },
] as const;

function isTabActive(
  pathname: string,
  tab: { href: string; exact?: boolean }
) {
  if (tab.exact) {
    return pathname === tab.href;
  }
  return pathname === tab.href || pathname.startsWith(`${tab.href}/`);
}

export default function AdminTabs() {
  const pathname = usePathname();
  const [role, setRole] = useState<string | null>(null);
  const isSettings =
    pathname.startsWith("/admin/settings") || SETTINGS_PATHS.has(pathname);

  useEffect(() => {
    void apiGet<{ user: { role: string } | null }>("/api/auth/me")
      .then((d) => setRole(d.user?.role ?? null))
      .catch(() => setRole(null));
  }, []);

  // Only render on settings pages for ADMIN role
  if (role !== "ADMIN" || !isSettings) {
    return null;
  }

  return (
    <div className="mb-6 max-w-full overflow-x-auto pb-1 scrollbar-none">
      <nav className="inline-flex flex-nowrap sm:flex-wrap gap-1 rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-slate-200">
        {SETTINGS_TABS.map((t) => {
          const active = isTabActive(pathname, t);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`rounded-xl px-3.5 py-2 text-xs font-medium transition ${
                active
                  ? "bg-teal-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-teal-50 hover:text-teal-700"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}