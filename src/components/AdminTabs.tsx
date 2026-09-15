"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/operations", label: "Operations" },
  { href: "/admin/gate", label: "Entry & exit gate" },
  { href: "/admin/pricing", label: "Dynamic pricing" },
  { href: "/admin/refunds", label: "Refunds & audit" },
];

export default function AdminTabs() {
  const pathname = usePathname();

  return (
    <nav className="mb-6 inline-flex flex-wrap gap-1 rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-slate-200">
      {TABS.map((t) => {
        const active = pathname === t.href;
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
  );
}