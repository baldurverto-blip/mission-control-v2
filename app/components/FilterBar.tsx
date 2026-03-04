"use client";

import type { ReactNode } from "react";

export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {children}
    </div>
  );
}

export function FilterSelect({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="bg-bg border border-warm rounded-lg px-3 py-1.5 text-xs text-charcoal focus:outline-none focus:border-terracotta/50 focus:ring-1 focus:ring-terracotta/20 transition-all cursor-pointer"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

export function FilterSearch({ value, onChange, placeholder = "Search..." }: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="bg-bg border border-warm rounded-lg px-3 py-1.5 text-xs text-charcoal placeholder:text-mid/50 focus:outline-none focus:border-terracotta/50 focus:ring-1 focus:ring-terracotta/20 transition-all"
    />
  );
}
