"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { apiGet } from "@/lib/api";

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

const OPERATOR_TABS = [
  { href: "/admin/operator", label: "Operator" },
  { href: "/admin/parking", label: "Parking Status" },
] as const;

const ADMIN_TABS = [
  { href: "/admin", label: "Dashboard", exact: true },
  ...OPERATOR_TABS,
  { href: "/admin/settings", label: "Settings", exact: true },
] as const;

function isActive(pathname: string, href: string, exact: boolean) {
  return exact ? pathname === href : pathname.startsWith(href);
}

export default function AdminTabs() {
  const pathname = usePathname();
  const [role, setRole] = useState<string | null>(null);
  const isSettings = pathname.startsWith("/admin/settings");

  useEffect(() => {
    void apiGet<{ user: { role: string } | null }>("/api/auth/me")
      .then((d) => setRole(d.user?.role ?? null))
      .catch(() => setRole(null));
  }, []);

  const tabs = role === "ADMIN" ? ADMIN_TABS : OPERATOR_TABS;
  if (role === null) {
    return <div className="mb-6 h-10" />;
  }

  return (
    <div className="mb-6">
      {/* ── Top-level tabs ────────────────────────────────────────────── */}
      <nav className="inline-flex flex-wrap gap-1 rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-slate-200">
        {tabs.map((t) => {
          const active = isActive(pathname, t.href, "exact" in t ? t.exact : false);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
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

      {/* ── Settings sub-tabs (only on settings pages) ────────────────── */}
      {isSettings && (
        <nav className="mt-2 inline-flex flex-wrap gap-1 rounded-xl bg-slate-50 p-1 ring-1 ring-slate-200">
          {SETTINGS_TABS.map((t) => {
            const active = isActive(pathname, t.href, "exact" in t ? t.exact : false);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  active
                    ? "bg-white text-teal-700 shadow-sm ring-1 ring-slate-200"
                    : "text-slate-500 hover:bg-white hover:text-slate-700"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}