/**
 * Widget iframe layout — no nav, no sidebar, no chrome.
 * Renders in a sandboxed iframe on the operator's customer-facing site.
 *
 * Must NOT define <html>/<body> — those come from the root app/layout.tsx.
 * AppShell detects /widget via usePathname and skips rendering nav chrome.
 */
export default function WidgetLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        html, body, #__next { height: 100%; margin: 0; padding: 0; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
          font-size: 14px;
          line-height: 1.5;
          color: #2A2927;
          background: #F5F0E6;
          -webkit-font-smoothing: antialiased;
        }
        *, *::before, *::after { box-sizing: border-box; }
      `}</style>
      {children}
    </>
  );
}
