"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiGet } from "@/lib/api";

const OPERATOR_ALLOWED = ["/admin/operator", "/admin/parking"];

let cachedRole: string | null = null;

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<string | null>(cachedRole);
  const [loading, setLoading] = useState(!cachedRole);

  useEffect(() => {
    let mounted = true;
    apiGet<{ user: { role: string } | null }>("/api/auth/me")
      .then((d) => {
        const r = d.user?.role ?? "GUEST";
        cachedRole = r;
        if (mounted) {
          setRole(r);
          setLoading(false);
        }
      })
      .catch(() => {
        cachedRole = "GUEST";
        if (mounted) {
          setRole("GUEST");
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const isOperatorAllowedPath = OPERATOR_ALLOWED.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );

  const isOperatorBlocked = role === "OPERATOR" && !isOperatorAllowedPath;
  const isUnauthorized = role === "USER" || role === "GUEST";

  useEffect(() => {
    if (!loading) {
      if (role === "GUEST") {
        router.replace("/login");
      } else if (role === "USER") {
        router.replace("/");
      } else if (role === "OPERATOR" && !isOperatorAllowedPath) {
        router.replace("/admin/operator");
      }
    }
  }, [loading, role, isOperatorAllowedPath, router]);

  if (loading || isOperatorBlocked || isUnauthorized) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}