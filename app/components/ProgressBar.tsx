export function ProgressBar({ done, total, color = "var(--olive)" }: { done: number; total: number; color?: string }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="w-full h-1.5 rounded-full bg-warm overflow-hidden relative">
      <div
        className="h-full rounded-full transition-all duration-700 ease-out relative overflow-hidden"
        style={{ width: `${pct}%`, backgroundColor: color }}
      >
        {pct > 0 && pct < 100 && (
          <div className="absolute inset-0 w-1/3 bg-gradient-to-r from-transparent via-white/20 to-transparent" style={{ animation: "shine 2s ease-in-out infinite" }} />
        )}
      </div>
    </div>
  );
}
