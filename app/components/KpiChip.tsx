export function KpiChip({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="bg-paper/60 border border-warm/60 rounded-xl px-3 py-2.5 text-center transition-all hover:bg-paper hover:border-warm">
      <p className="text-lg font-medium leading-none mb-0.5 tabular-nums" style={{ color, fontFamily: "var(--font-cormorant), Georgia, serif", fontWeight: 400, fontSize: "1.5rem" }}>
        {value}
      </p>
      <p className="label-caps text-[0.7rem] leading-none">
        <span className="text-mid/80">{label}</span>
        {sub && <span className="text-mid/60 ml-0.5">· {sub}</span>}
      </p>
    </div>
  );
}
