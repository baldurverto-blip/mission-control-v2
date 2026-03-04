"use client";

interface Tab {
  id: string;
  label: string;
  count?: number;
}

export function TabBar({ tabs, active, onChange }: { tabs: Tab[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="flex gap-1 bg-warm/50 p-1 rounded-lg">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`px-3 py-1.5 rounded-md text-xs tracking-wide transition-all cursor-pointer ${
            active === tab.id
              ? "bg-paper text-charcoal shadow-sm"
              : "text-mid hover:text-charcoal"
          }`}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className="ml-1.5 text-[0.6rem] tabular-nums opacity-60">{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
