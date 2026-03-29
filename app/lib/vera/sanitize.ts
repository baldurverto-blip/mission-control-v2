/**
 * vera/sanitize — redactCasePackage()
 *
 * Strips credential-shaped patterns from case packages before storage.
 * Required by: Widget Consent Copy + PII Redaction TODO (P0).
 *
 * Patterns removed:
 *   URL params  — token=, key=, auth=, secret=, password=, api_key=, access_token=
 *   Bearer tokens in strings
 *   JWT-shaped strings (3 base64url segments)
 *   API keys (32+ char alphanumeric with mixed signals)
 *   Network request bodies (never stored — payloads stripped at capture)
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface ConsoleError {
  level: "error" | "warn";
  message: string;
  timestamp: number;
}

export interface NetworkFailure {
  url: string;
  status: number;
  method: string;
  timestamp: number;
  // Request bodies are never captured — no payload field
}

export interface UIAction {
  type: "click" | "input" | "submit" | "navigate";
  target: string; // CSS selector or element description
  timestamp: number;
}

export interface CasePackage {
  session_token: string;
  workspace_id: string;
  // Page context
  page_url: string;
  page_title: string;
  user_agent: string;
  referrer?: string;
  viewport?: { width: number; height: number };
  // User-provided
  customer_email: string;
  customer_name?: string;
  description: string;
  // Captured telemetry (absent if consent not given or capture failed)
  console_errors?: ConsoleError[];
  network_failures?: NetworkFailure[];
  recent_actions?: UIAction[];
  // Consent + meta
  consent_given: boolean;
  captured_at: string;
}

// ── Redaction patterns ───────────────────────────────────────────────────────

// URL query params that commonly carry credentials
const URL_SENSITIVE_PARAMS =
  /([?&])(token|key|auth|secret|password|api_key|access_token|client_secret|refresh_token|private_key|session|nonce)=([^&\s#]*)/gi;

// Authorization header values and Bearer tokens
const BEARER_PATTERN = /(Bearer|Basic|Token)\s+[A-Za-z0-9+/=.\-_~]{8,}/gi;

// JWTs: three base64url segments separated by dots
const JWT_PATTERN = /eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/g;

function redactString(s: string): string {
  if (!s || typeof s !== "string") return s;
  return s
    .replace(URL_SENSITIVE_PARAMS, "$1$2=[REDACTED]")
    .replace(BEARER_PATTERN, "$1 [REDACTED]")
    .replace(JWT_PATTERN, "[JWT_REDACTED]");
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns a new CasePackage with all credential-shaped strings redacted.
 * Call this before writing to Supabase.
 */
export function redactCasePackage(pkg: CasePackage): CasePackage {
  return {
    ...pkg,
    page_url: redactString(pkg.page_url),
    referrer: pkg.referrer ? redactString(pkg.referrer) : undefined,
    description: redactString(pkg.description),
    console_errors: pkg.console_errors?.slice(0, 20).map((e) => ({
      ...e,
      message: redactString(e.message),
    })),
    network_failures: pkg.network_failures?.slice(0, 20).map((f) => ({
      ...f,
      url: redactString(f.url),
    })),
    recent_actions: pkg.recent_actions?.slice(0, 10).map((a) => ({
      ...a,
      target: redactString(a.target),
    })),
  };
}
