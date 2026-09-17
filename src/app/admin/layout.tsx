"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiGet } from "@/lib/api";

const OPERATOR_ALLOWED = new Set(["/admin/operator", "/admin/parking"]);

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    void apiGet<{ user: { role: string } | null }>("/api/auth/me")
      .then((d) => setRole(d.user?.role ?? null))
      .catch(() => setRole(null));
  }, []);

  const blocked = role === "OPERATOR" && !OPERATOR_ALLOWED.has(pathname);

  useEffect(() => {
    if (blocked) router.replace("/admin/operator");
  }, [blocked, router]);

  if (blocked) return null;

  return <>{children}</>;
}