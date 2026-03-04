import { KpiChip } from "./KpiChip";

interface Metric {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}

export function MetricsBar({ metrics }: { metrics: Metric[] }) {
  return (
    <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${Math.min(metrics.length, 8)}, 1fr)` }}>
      {metrics.map((m) => (
        <KpiChip
          key={m.label}
          label={m.label}
          value={m.value}
          sub={m.sub ?? ""}
          color={m.color ?? "var(--mid)"}
        />
      ))}
    </div>
  );
}
