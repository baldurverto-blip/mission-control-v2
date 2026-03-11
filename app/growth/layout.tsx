"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { StatusDot } from "../components/StatusDot";
import { GROWTH_TABS } from "../lib/navigation";

export default function GrowthLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [status, setStatus] = useState<string>("loading");
  const [version, setVersion] = useState("—");

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch("/api/growthops");
        const data = await res.json();
        setStatus(data.status === "online" ? "ok" : "error");
        setVersion(data.version || "—");
      } catch {
        setStatus("error");
      }
    }
    check();
    const iv = setInterval(check, 30_000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="min-h-screen">
      {/* Shared header */}
      <header className="px-8 pt-8 pb-0 max-w-[1440px] mx-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-4xl text-charcoal tracking-tight">Growth Ops</h1>
            <p className="text-mid text-sm mt-1">Your content engine at a glance</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusDot status={status} size="md" />
            <span className="text-[0.8rem] text-mid/80 label-caps">{version}</span>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="flex gap-1 bg-warm/50 p-1 rounded-lg overflow-x-auto custom-scroll">
          {GROWTH_TABS.map((tab) => {
            const active =
              tab.href === "/growth"
                ? pathname === "/growth"
                : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`px-3 py-1.5 rounded-md text-xs tracking-wide transition-all whitespace-nowrap ${
                  active
                    ? "bg-paper text-charcoal shadow-sm font-medium"
                    : "text-mid hover:text-charcoal"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </header>

      {/* Offline banner */}
      {status === "error" && (
        <div
          className="mx-8 mt-3 px-4 py-2.5 rounded-lg text-xs flex items-center gap-2 max-w-[1440px]"
          style={{ backgroundColor: "var(--terracotta-soft)", color: "var(--terracotta)" }}
        >
          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: "var(--terracotta)" }} />
          Growth-Ops backend is offline — data may be stale or unavailable
        </div>
      )}

      {/* Page content */}
      {children}
    </div>
  );
}
