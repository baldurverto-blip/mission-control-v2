export function StatusDot({ status, size = "sm" }: { status?: string; size?: "sm" | "md" }) {
  const color =
    status === "ok" || status === "online" || status === "active" ? "var(--olive)"
    : status === "error" || status === "offline" ? "var(--terracotta)"
    : "var(--mid)";
  const px = size === "md" ? "w-2.5 h-2.5" : "w-1.5 h-1.5";
  return (
    <span
      className={`inline-block ${px} rounded-full flex-shrink-0 ${status === "ok" || status === "online" || status === "active" ? "pulse-dot" : ""}`}
      style={{ backgroundColor: color }}
    />
  );
}
