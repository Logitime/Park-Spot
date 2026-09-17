"use client";

import Link from "next/link";
import AdminTabs from "@/components/AdminTabs";

const SECTIONS = [
  {
    href: "/admin/operations",
    title: "Operations",
    desc: "Live board, search, check-in/out, revenue, plate recognition logs.",
    icon: "Dashboard",
  },
  {
    href: "/admin/users",
    title: "Users",
    desc: "Manage OPERATOR and ADMIN accounts, gate access, shift roster.",
    icon: "Users",
  },
  {
    href: "/admin/zones",
    title: "Zones",
    desc: "Organize lots into zones (floors / sections) with pricing rules.",
    icon: "Zones",
  },
  {
    href: "/admin/shifts",
    title: "Shifts & Staffing",
    desc: "Define work shifts and assign operators to gates per shift.",
    icon: "Shifts",
  },
  {
    href: "/admin/gate",
    title: "Entry & Exit Gate",
    desc: "Real-time gate status, barrier control, PLC diagnostics, plate recognition.",
    icon: "Gate",
  },
  {
    href: "/admin/gates",
    title: "Gate Config",
    desc: "Configure entry/exit gates: cameras, LOGO! PLC, zones, operators.",
    icon: "Config",
  },
  {
    href: "/admin/pricing",
    title: "Dynamic Pricing",
    desc: "Zone-based pricing rules, auto-surge, event-driven multipliers.",
    icon: "Pricing",
  },
  {
    href: "/admin/refunds",
    title: "Refunds & Audit",
    desc: "Refund queue, audit log, policy tuning, manual overrides.",
    icon: "Audit",
  },
] as const;

export default function SettingsPage() {
  return (
    <main className="mx-auto max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage users, zones, shifts, gates, pricing and system operations.
        </p>
      </div>

      <AdminTabs />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="group rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-teal-200 hover:shadow-md"
          >
            <h2 className="text-base font-semibold text-slate-800 group-hover:text-teal-700">
              {s.title}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
              {s.desc}
            </p>
            <span className="mt-3 inline-block text-xs font-medium text-teal-600 group-hover:underline">
              Open →
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}