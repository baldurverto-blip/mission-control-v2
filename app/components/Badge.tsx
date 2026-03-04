import type { ReactNode } from "react";

export function Badge({ children, color }: { children: ReactNode; color: string }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.625rem] font-medium tracking-wide"
      style={{ backgroundColor: `${color}18`, color }}
    >
      {children}
    </span>
  );
}
