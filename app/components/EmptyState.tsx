interface EmptyStateProps {
  title?: string;
  message?: string;
  offline?: boolean;
}

export function EmptyState({ title, message, offline }: EmptyStateProps) {
  return (
    <div className="py-12 text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-4" style={{ backgroundColor: offline ? "var(--terracotta-soft)" : "var(--warm)" }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          {offline ? (
            <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm0 11a1 1 0 110-2 1 1 0 010 2zm1-4a1 1 0 01-2 0V6a1 1 0 012 0v3z" fill="var(--terracotta)" />
          ) : (
            <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm1 11H9v-2h2v2zm0-4H9V5h2v4z" fill="var(--mid)" />
          )}
        </svg>
      </div>
      <p className="text-sm font-medium" style={{ color: offline ? "var(--terracotta)" : "var(--charcoal)" }}>
        {title ?? (offline ? "Backend offline" : "No data")}
      </p>
      <p className="text-xs mt-1" style={{ color: "var(--mid)" }}>
        {message ?? (offline ? "Growth-Ops server is not reachable" : "Nothing to show yet")}
      </p>
    </div>
  );
}
