import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fleet — Live Product Operations",
};

export default function FleetLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <main style={{ flex: 1, padding: "24px 32px" }}>
        {children}
      </main>
    </div>
  );
}
