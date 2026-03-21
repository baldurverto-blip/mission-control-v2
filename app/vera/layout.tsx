import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Vera — Agent-Operated Service Desk",
};

const NAV_ITEMS = [
  { href: "/vera",           label: "Overview" },
  { href: "/vera/queue",     label: "Queue" },
  { href: "/vera/kb",        label: "KB Health" },
  { href: "/vera/bugs",      label: "Bug Reports" },
  { href: "/vera/features",  label: "Features" },
] as const;

export default function VeraLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      {/* Vera sub-nav */}
      <nav
        style={{
          borderBottom: "1px solid var(--warm)",
          padding: "0 24px",
          display: "flex",
          gap: 0,
          background: "var(--paper)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-cormorant), Georgia, serif",
            fontSize: 15,
            fontWeight: 500,
            color: "var(--charcoal)",
            padding: "10px 16px 10px 0",
            borderRight: "1px solid var(--warm)",
            marginRight: 4,
          }}
        >
          Vera
        </span>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            style={{
              padding: "10px 16px",
              fontSize: 13,
              color: "var(--mid)",
              textDecoration: "none",
              fontFamily: "var(--font-dm-mono), monospace",
            }}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <main style={{ flex: 1, padding: "24px 32px" }}>
        {children}
      </main>
    </div>
  );
}
