"use client";

import { useState, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_GROUPS } from "../lib/navigation";
import { StatusDot } from "./StatusDot";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // Widget route renders in a sandboxed iframe — no nav chrome needed.
  if (pathname.startsWith("/widget")) {
    return <>{children}</>;
  }

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [growthStatus, setGrowthStatus] = useState<string>("loading");
  const [badgeCounts, setBadgeCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    async function checkHealth() {
      try {
        const [healthRes, statsRes] = await Promise.all([
          fetch("/api/growthops").then((r) => r.json()).catch(() => null),
          fetch("/api/growth/queue/stats").then((r) => r.json()).catch(() => null),
        ]);
        setGrowthStatus(healthRes?.status === "online" ? "ok" : "error");
        if (statsRes?.queued) {
          setBadgeCounts((prev) => ({ ...prev, "/growth/queue": statsRes.queued }));
        }
      } catch {
        setGrowthStatus("error");
      }
    }
    checkHealth();
    const iv = setInterval(checkHealth, 30_000);
    return () => clearInterval(iv);
  }, []);

  // Close mobile menu on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-charcoal/30 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 h-full z-50 bg-paper border-r border-warm flex flex-col
          transition-all duration-200 ease-out
          ${collapsed ? "w-14" : "w-60"}
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
          lg:translate-x-0 lg:sticky
        `}
      >
        {/* Logo / Collapse toggle */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-warm flex-shrink-0">
          {!collapsed && (
            <span className="label-caps text-lilac tracking-[0.25em] text-[0.8rem]">VertoOS</span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-mid hover:text-charcoal transition-colors cursor-pointer hidden lg:block"
            title={collapsed ? "Expand" : "Collapse"}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {collapsed
                ? <path d="M13 17l5-5-5-5M6 17l5-5-5-5" />
                : <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" />
              }
            </svg>
          </button>
        </div>

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto custom-scroll py-3">
          {NAV_GROUPS.map((group) => {
            // Group-as-link mode: no sub-items, renders as a single nav link
            if (group.href && group.items.length === 0) {
              const active = pathname.startsWith(group.href);
              return (
                <div key={group.label} className="mb-4">
                  {!collapsed && (
                    <div className="flex items-center gap-2 px-4 mb-1">
                      <span className="label-caps text-[0.75rem]">{group.label}</span>
                      {group.healthEndpoint && (
                        <StatusDot status={growthStatus} size="sm" />
                      )}
                    </div>
                  )}
                  <Link
                    href={group.href}
                    title={collapsed ? group.label : undefined}
                    className={`
                      flex items-center gap-3 px-4 py-2 mx-2 rounded-lg text-sm transition-all
                      ${active
                        ? "bg-warm text-charcoal font-medium border-l-2"
                        : "text-mid hover:text-charcoal hover:bg-warm/50 border-l-2 border-transparent"
                      }
                    `}
                    style={active ? { borderLeftColor: "var(--terracotta)" } : undefined}
                  >
                    {group.icon && (
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="flex-shrink-0"
                      >
                        <path d={group.icon} />
                      </svg>
                    )}
                    {!collapsed && <span className="flex-1">Overview</span>}
                  </Link>
                </div>
              );
            }

            // Standard group with sub-items
            return (
              <div key={group.label} className="mb-4">
                {!collapsed && (
                  <div className="flex items-center gap-2 px-4 mb-1">
                    <span className="label-caps text-[0.75rem]">{group.label}</span>
                    {group.healthEndpoint && (
                      <StatusDot status={growthStatus} size="sm" />
                    )}
                  </div>
                )}
                {group.items.map((item) => {
                  const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={`
                        flex items-center gap-3 px-4 py-2 mx-2 rounded-lg text-sm transition-all
                        ${active
                          ? "bg-warm text-charcoal font-medium border-l-2"
                          : "text-mid hover:text-charcoal hover:bg-warm/50 border-l-2 border-transparent"
                        }
                      `}
                      style={active ? { borderLeftColor: "var(--terracotta)" } : undefined}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="flex-shrink-0"
                      >
                        <path d={item.icon} />
                      </svg>
                      {!collapsed && (
                        <>
                          <span className="flex-1">{item.label}</span>
                          {badgeCounts[item.href] > 0 && (
                            <span
                              className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full text-[0.75rem] font-medium text-paper"
                              style={{ backgroundColor: "var(--terracotta)" }}
                            >
                              {badgeCounts[item.href]}
                            </span>
                          )}
                        </>
                      )}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        {!collapsed && (
          <div className="px-4 py-3 border-t border-warm">
            <p className="label-caps text-mid/60 text-[0.7rem]">Verto Studios</p>
          </div>
        )}
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileOpen(true)}
          className="lg:hidden fixed top-4 left-4 z-30 p-2 rounded-lg bg-paper border border-warm shadow-sm cursor-pointer"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--charcoal)" strokeWidth="2" strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        {children}
      </div>
    </div>
  );
}
