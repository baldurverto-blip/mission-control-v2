"use client";

/**
 * /widget — Vera support widget iframe
 *
 * Three screens:
 *   1. Consent  — GDPR disclosure, [Allow] / [Decline]
 *   2. Form     — email, name (optional), description
 *   3. Waiting  — SSE reply thread
 *
 * Context capture happens in the parent page (vera-widget.js).
 * Consent decision + captured context arrive here via postMessage.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import type { CasePackage, ConsoleError, NetworkFailure, UIAction } from "../lib/vera/sanitize";

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  wrap: {
    display: "flex",
    flexDirection: "column" as const,
    height: "100vh",
    background: "#F5F0E6",
    overflow: "hidden",
  },
  header: {
    padding: "14px 18px 12px",
    borderBottom: "1px solid rgba(42,41,39,0.10)",
    background: "#FAF7F1",
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#BC6143",
    flexShrink: 0,
  },
  title: {
    fontSize: 13,
    fontWeight: 600,
    color: "#2A2927",
    letterSpacing: "0.02em",
  },
  sub: {
    fontSize: 11,
    color: "#5A554D",
    marginLeft: "auto",
  },
  body: {
    flex: 1,
    overflowY: "auto" as const,
    padding: 18,
  },
  label: {
    display: "block",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
    color: "#5A554D",
    marginBottom: 6,
  },
  input: {
    width: "100%",
    padding: "9px 12px",
    fontSize: 13,
    color: "#2A2927",
    background: "#FAF7F1",
    border: "1px solid rgba(42,41,39,0.18)",
    borderRadius: 6,
    outline: "none",
    fontFamily: "inherit",
    transition: "border-color 0.15s",
  },
  textarea: {
    width: "100%",
    padding: "9px 12px",
    fontSize: 13,
    color: "#2A2927",
    background: "#FAF7F1",
    border: "1px solid rgba(42,41,39,0.18)",
    borderRadius: 6,
    outline: "none",
    resize: "vertical" as const,
    minHeight: 90,
    fontFamily: "inherit",
    lineHeight: 1.5,
    transition: "border-color 0.15s",
  },
  btnPrimary: {
    width: "100%",
    padding: "10px 18px",
    fontSize: 13,
    fontWeight: 600,
    color: "#FAF7F1",
    background: "#BC6143",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    letterSpacing: "0.02em",
    transition: "background 0.15s",
  },
  btnGhost: {
    width: "100%",
    padding: "9px 18px",
    fontSize: 12,
    color: "#5A554D",
    background: "transparent",
    border: "1px solid rgba(42,41,39,0.15)",
    borderRadius: 6,
    cursor: "pointer",
  },
  card: {
    background: "#FAF7F1",
    border: "1px solid rgba(42,41,39,0.10)",
    borderRadius: 8,
    padding: 14,
    marginBottom: 14,
  },
  consentText: {
    fontSize: 13,
    color: "#2A2927",
    lineHeight: 1.6,
    marginBottom: 14,
  },
  consentSub: {
    fontSize: 11,
    color: "#90897F",
    lineHeight: 1.5,
    marginBottom: 18,
  },
  message: {
    padding: "10px 14px",
    borderRadius: 8,
    fontSize: 13,
    lineHeight: 1.5,
    maxWidth: "90%",
    marginBottom: 10,
  },
  field: {
    marginBottom: 14,
  },
  footer: {
    padding: "12px 18px",
    borderTop: "1px solid rgba(42,41,39,0.08)",
    background: "#FAF7F1",
  },
  err: {
    fontSize: 11,
    color: "#D94F3D",
    marginTop: 6,
  },
};

// ── Context from parent page ───────────────────────────────────────────────────

interface ParentContext {
  workspace_id: string;
  page_url: string;
  page_title: string;
  user_agent: string;
  referrer?: string;
  viewport?: { width: number; height: number };
  console_errors?: ConsoleError[];
  network_failures?: NetworkFailure[];
  recent_actions?: UIAction[];
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Screen = "consent" | "form" | "waiting";

interface Reply {
  role: "customer" | "vera";
  content: string;
}

// ── Widget page ───────────────────────────────────────────────────────────────

export default function WidgetPage() {
  const [screen, setScreen] = useState<Screen>("consent");
  const [consentGiven, setConsentGiven] = useState(false);
  const [context, setContext] = useState<ParentContext | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [caseId, setCaseId] = useState("");
  const [sessionToken] = useState(() => {
    // crypto.randomUUID() requires a secure context (HTTPS/localhost).
    // Fall back to a manual implementation for plain HTTP (LAN testing).
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  });
  const [replies, setReplies] = useState<Reply[]>([]);
  const [sseRetries, setSseRetries] = useState(0);
  const [sseStatus, setSseStatus] = useState<"connecting" | "live" | "fallback">("connecting");
  const esRef = useRef<EventSource | null>(null);

  // ── Receive messages from parent page ───────────────────────────────────────
  useEffect(() => {
    async function handleMessage(e: MessageEvent) {
      if (!e.data) return;

      if (e.data.type === "VERA_CONTEXT") {
        setContext(e.data.payload as ParentContext);
        return;
      }

      // Parent captured a screenshot and relayed it here
      if (e.data.type === "VERA_SCREENSHOT") {
        try {
          await fetch("/api/vera/widget/screenshot", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              case_id: e.data.case_id,
              session_token: sessionToken,
              screenshot_data: e.data.screenshot_data,
            }),
          });
        } catch {
          // best-effort
        }
      }
    }
    window.addEventListener("message", handleMessage);
    window.parent.postMessage({ type: "VERA_REQUEST_CONTEXT" }, "*");
    return () => window.removeEventListener("message", handleMessage);
  }, [sessionToken]);

  // ── SSE connection (starts after case created) ───────────────────────────────
  const connectSSE = useCallback(
    (case_id: string, retryCount = 0) => {
      if (retryCount >= 5) {
        setSseStatus("fallback");
        return;
      }

      const es = new EventSource(
        `/api/vera/widget/stream?session_token=${sessionToken}&case_id=${case_id}`
      );
      esRef.current = es;

      es.addEventListener("connected", () => setSseStatus("live"));

      es.addEventListener("reply", (e) => {
        try {
          const data = JSON.parse(e.data);
          const fullContent = String(data.content ?? "");
          // Add empty slot, then typewriter-animate it
          setReplies((prev) => [...prev, { role: "vera" as const, content: "" }]);
          let i = 0;
          function typeNext() {
            i++;
            setReplies((prev) => {
              const next = [...prev];
              next[next.length - 1] = { role: "vera", content: fullContent.slice(0, i) };
              return next;
            });
            if (i < fullContent.length) setTimeout(typeNext, 14);
          }
          setTimeout(typeNext, 14);
        } catch {
          // ignore malformed
        }
      });

      es.onerror = () => {
        es.close();
        const delay = Math.pow(2, retryCount) * 1000;
        setTimeout(() => {
          setSseRetries(retryCount + 1);
          connectSSE(case_id, retryCount + 1);
        }, delay);
      };
    },
    [sessionToken]
  );

  // ── Close SSE on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => esRef.current?.close();
  }, []);

  // ── Consent decision ───────────────────────────────────────────────────────
  function handleConsent(allow: boolean) {
    setConsentGiven(allow);
    setScreen("form");
  }

  // ── Submit case ────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !description.trim()) {
      setError("Email and description are required.");
      return;
    }
    setError("");
    setSubmitting(true);

    const pkg: CasePackage = {
      session_token: sessionToken,
      workspace_id: context?.workspace_id ?? "",
      page_url: context?.page_url ?? window.location.href,
      page_title: context?.page_title ?? document.title,
      user_agent: context?.user_agent ?? navigator.userAgent,
      referrer: context?.referrer,
      viewport: context?.viewport,
      customer_email: email.trim(),
      customer_name: name.trim() || undefined,
      description: description.trim(),
      // Only include telemetry if consent given
      console_errors: consentGiven ? context?.console_errors : undefined,
      network_failures: consentGiven ? context?.network_failures : undefined,
      recent_actions: consentGiven ? context?.recent_actions : undefined,
      consent_given: consentGiven,
      captured_at: new Date().toISOString(),
    };

    try {
      const res = await fetch("/api/vera/widget/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pkg),
      });

      if (!res.ok) {
        throw new Error(`intake failed: ${res.status}`);
      }

      const { case_id } = await res.json();
      setCaseId(case_id);
      setReplies([{ role: "customer", content: description.trim() }]);
      setScreen("waiting");
      // Signal parent so it can inject the share button in parent-page context
      window.parent.postMessage({ type: "VERA_WAITING", case_id }, "*");
      connectSSE(case_id);
    } catch (err) {
      setError("Something went wrong. Please try again.");
      console.error("[vera widget]", err);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={S.wrap}>
      {/* Header */}
      <div style={S.header}>
        <div style={S.dot} />
        <span style={S.title}>Support</span>
        <span style={S.sub}>Vera</span>
      </div>

      {/* Consent screen */}
      {screen === "consent" && (
        <>
          <div style={S.body}>
            <div style={{ marginBottom: 24 }} />
            <p style={S.consentText}>
              Before we start, Vera can capture technical details — like which page
              you're on, recent errors, and browser info — to help resolve your
              issue faster.
            </p>
            <p style={S.consentSub}>
              Sensitive tokens are automatically redacted. No personal data beyond
              what you type is collected or stored.
            </p>
            <button
              style={S.btnPrimary}
              onClick={() => handleConsent(true)}
            >
              Allow technical capture
            </button>
            <div style={{ height: 10 }} />
            <button
              style={S.btnGhost}
              onClick={() => handleConsent(false)}
            >
              Continue without — text only
            </button>
          </div>
        </>
      )}

      {/* Form screen */}
      {screen === "form" && (
        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", height: "100%" }}
        >
          <div style={S.body}>
            {consentGiven && (
              <div
                style={{
                  ...S.card,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 18,
                }}
              >
                <span style={{ fontSize: 11, color: "#76875A", fontWeight: 600, letterSpacing: "0.08em" }}>
                  CONTEXT CAPTURED
                </span>
                <span style={{ fontSize: 11, color: "#5A554D" }}>
                  Page, device + recent errors included
                </span>
              </div>
            )}

            <div style={S.field}>
              <label style={S.label}>Email</label>
              <input
                style={S.input}
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div style={S.field}>
              <label style={S.label}>Name <span style={{ color: "#90897F", fontWeight: 400 }}>(optional)</span></label>
              <input
                style={S.input}
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div style={S.field}>
              <label style={S.label}>What&apos;s happening?</label>
              <textarea
                style={S.textarea}
                placeholder="Describe the issue…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </div>

            {error && <p style={S.err}>{error}</p>}
          </div>

          <div style={S.footer}>
            <button
              style={{ ...S.btnPrimary, opacity: submitting ? 0.6 : 1 }}
              type="submit"
              disabled={submitting}
            >
              {submitting ? "Sending…" : "Send to Vera"}
            </button>
          </div>
        </form>
      )}

      {/* Waiting / reply thread */}
      {screen === "waiting" && (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
          <div style={{ ...S.body, flex: 1 }}>
            {replies.map((r, i) => (
              <div
                key={i}
                style={{
                  ...S.message,
                  background: r.role === "customer" ? "#EDE8DE" : "#FAF7F1",
                  marginLeft: r.role === "customer" ? "auto" : 0,
                  marginRight: r.role === "customer" ? 0 : "auto",
                  border:
                    r.role === "vera"
                      ? "1px solid rgba(42,41,39,0.10)"
                      : "none",
                }}
              >
                {r.content}
              </div>
            ))}

            {sseStatus === "connecting" && (
              <div style={{ fontSize: 12, color: "#90897F", marginTop: 12 }}>
                Connecting to Vera…
              </div>
            )}

            {sseStatus === "live" && replies.length < 2 && (
              <div style={{ fontSize: 12, color: "#90897F", marginTop: 12 }}>
                Vera is reviewing your request…
              </div>
            )}

            {sseStatus === "fallback" && (
              <div
                style={{
                  ...S.card,
                  borderColor: "rgba(201,162,39,0.3)",
                  background: "#C9A22708",
                }}
              >
                <p style={{ fontSize: 12, color: "#5A554D", lineHeight: 1.6 }}>
                  Connection dropped after {sseRetries} retries. Check your
                  email — Vera will reply there.
                </p>
              </div>
            )}
          </div>

          <div style={{ ...S.footer, fontSize: 11, color: "#90897F", textAlign: "center" as const }}>
            Case #{caseId.slice(-8).toUpperCase()}
          </div>
        </div>
      )}
    </div>
  );
}
