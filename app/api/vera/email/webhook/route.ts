/**
 * POST /api/vera/email/webhook
 *
 * AgentMail webhook receiver — processes incoming email for vertosupport@agentmail.to.
 *
 * Payload shape: message.received event from AgentMail.
 * Ref: ~/verto-workspace/skills/agentmail/references/WEBHOOKS.md
 *
 * Logic:
 *  1. Parse AgentMail message.received payload
 *  2. Check for existing open case by thread_id (reply chain grouping)
 *     OR by [VERA-<case_id>] subject tag (fallback threading)
 *  3. If reply → add case_message, no new case
 *  4. If new → assemble case package, create case + initial message
 *  5. Resolution pipeline hook (Week 4 TODO)
 *
 * Product routing: subject prefix "[safebite]", "[hytrack]", etc.
 * Sentiment: rudimentary negative-word scan for case priority hint.
 */

import { NextRequest, NextResponse } from "next/server";
import { redactCasePackage, CasePackage } from "../../../../lib/vera/sanitize";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const AGENTMAIL_WEBHOOK_SECRET = process.env.AGENTMAIL_WEBHOOK_SECRET;

// ── Supabase helper ──────────────────────────────────────────────────────────

function sb(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers as Record<string, string>),
    },
  });
}

// ── AgentMail payload types ──────────────────────────────────────────────────

interface AgentMailAddress {
  name?: string;
  email: string;
}

interface AgentMailMessage {
  inbox_id: string;
  thread_id: string;
  message_id: string;
  from: AgentMailAddress[];
  to: AgentMailAddress[];
  subject: string;
  text?: string;
  html?: string;
  timestamp: string;
  labels?: string[];
  // References and In-Reply-To headers for threading
  references?: string[];
  in_reply_to?: string;
  has_attachments?: boolean;
}

interface AgentMailThread {
  thread_id: string;
  subject: string;
  participants: string[];
  message_count: number;
}

interface AgentMailWebhookPayload {
  type: "event";
  event_type: string;
  event_id: string;
  message?: AgentMailMessage;
  thread?: AgentMailThread;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// Extract product tag from subject prefix: "[SafeBite] Password reset" → "safebite"
function extractProductTag(subject: string): string | null {
  const m = subject.match(/^\[([^\]]+)\]/);
  return m ? m[1].toLowerCase().replace(/\s+/g, "-") : null;
}

// Extract Vera case ID from subject: "Re: [VERA-ABC12345] ..." → "ABC12345..."
function extractVeraCaseId(subject: string): string | null {
  const m = subject.match(/\[VERA-([A-Z0-9]{8})\]/);
  return m ? m[1] : null;
}

// Rudimentary sentiment: negative words → -1, positive → +1, neutral → 0
const NEGATIVE_WORDS =
  /\b(frustrated|broken|terrible|awful|urgent|critical|not working|doesn't work|failed|error|bug|crash|lost|missing|impossible|horrible|disgusting|furious|angry|unacceptable|disaster|worst)\b/i;
const POSITIVE_WORDS =
  /\b(great|amazing|love|perfect|excellent|wonderful|thanks|thank you|appreciate|happy|pleased|fantastic)\b/i;

function estimateSentiment(text: string): "negative" | "neutral" | "positive" {
  if (NEGATIVE_WORDS.test(text)) return "negative";
  if (POSITIVE_WORDS.test(text)) return "positive";
  return "neutral";
}

// Body text: prefer plain text, fall back to HTML stripped
function extractBodyText(msg: AgentMailMessage): string {
  if (msg.text) return msg.text.trim().slice(0, 5000);
  if (msg.html) {
    return msg.html
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 5000);
  }
  return "";
}

// The workspace for dogfood — all email from vertosupport goes here
const DOGFOOD_WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";

// ── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Optional webhook secret verification ─────────────────────────────────
  if (AGENTMAIL_WEBHOOK_SECRET) {
    const signature = req.headers.get("x-agentmail-signature") || "";
    // AgentMail uses HMAC-SHA256; verify if secret is configured
    // For now: presence of the header is the check (full HMAC added when docs confirm scheme)
    if (!signature) {
      return NextResponse.json({ error: "missing_signature" }, { status: 401 });
    }
  }

  let payload: AgentMailWebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Only process message.received
  if (payload.event_type !== "message.received" || !payload.message) {
    return NextResponse.json({ ok: true, skipped: payload.event_type });
  }

  const msg = payload.message;
  const body = extractBodyText(msg);
  const senderEmail = msg.from?.[0]?.email ?? "";
  const senderName = msg.from?.[0]?.name ?? undefined;

  // Ignore our own sends (loop prevention)
  if (senderEmail === "vertosupport@agentmail.to") {
    return NextResponse.json({ ok: true, skipped: "own_send" });
  }

  const threadId = msg.thread_id;
  const subject = msg.subject || "(no subject)";
  const productTag = extractProductTag(subject);
  const veraTag = extractVeraCaseId(subject);
  const sentiment = estimateSentiment(body);

  // ── Check for existing case: VERA subject tag takes priority ─────────────
  let existingCaseId: string | null = null;

  if (veraTag) {
    // Look up by the short case ID suffix embedded in subject tag
    const tagRes = await sb(
      `cases?id=like.*${veraTag}&workspace_id=eq.${DOGFOOD_WORKSPACE_ID}&select=id&limit=1`,
      { method: "GET" }
    );
    if (tagRes.ok) {
      const rows = await tagRes.json();
      if (rows.length) existingCaseId = rows[0].id;
    }
  }

  // Fallback: look up by thread_id stored in metadata of first message
  if (!existingCaseId && threadId) {
    const threadRes = await sb(
      `case_messages?metadata->>thread_id=eq.${encodeURIComponent(threadId)}&workspace_id=eq.${DOGFOOD_WORKSPACE_ID}&select=case_id&limit=1`,
      { method: "GET" }
    );
    if (threadRes.ok) {
      const rows = await threadRes.json();
      if (rows.length) existingCaseId = rows[0].case_id;
    }
  }

  // ── Reply chain: add message to existing case ─────────────────────────────
  if (existingCaseId) {
    const msgPayload = {
      workspace_id: DOGFOOD_WORKSPACE_ID,
      case_id: existingCaseId,
      role: "customer",
      content: body,
      metadata: {
        channel: "email",
        thread_id: threadId,
        message_id: msg.message_id,
        subject,
        has_attachments: msg.has_attachments ?? false,
        sentiment,
      },
    };
    await sb("case_messages", {
      method: "POST",
      body: JSON.stringify(msgPayload),
    });

    // Re-open if resolved
    await sb(
      `cases?id=eq.${existingCaseId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ status: "open", updated_at: new Date().toISOString() }),
      }
    );

    return NextResponse.json({ ok: true, case_id: existingCaseId, action: "reply_added" });
  }

  // ── New case ──────────────────────────────────────────────────────────────

  // 48h repeat contact check
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const repeatRes = await sb(
    `cases?workspace_id=eq.${DOGFOOD_WORKSPACE_ID}&customer_email=eq.${encodeURIComponent(senderEmail)}&created_at=gte.${cutoff}&status=eq.open&select=id&limit=1`,
    { method: "GET" }
  );
  const isRepeat = repeatRes.ok ? (await repeatRes.json()).length > 0 : false;

  // Case package for redaction
  const rawPkg: CasePackage = {
    session_token: msg.message_id,
    workspace_id: DOGFOOD_WORKSPACE_ID,
    page_url: "",
    page_title: subject,
    user_agent: "email",
    customer_email: senderEmail,
    customer_name: senderName,
    description: body,
    consent_given: false, // Email intake: no explicit consent banner, no widget telemetry
    captured_at: msg.timestamp,
  };
  const pkg = redactCasePackage(rawPkg);

  const casePayload = {
    workspace_id: DOGFOOD_WORKSPACE_ID,
    customer_email: pkg.customer_email,
    customer_name: pkg.customer_name ?? null,
    subject: subject.slice(0, 120),
    body: pkg.description,
    status: "open",
    tier: null,
    confidence_score: null,
    is_repeat_contact: isRepeat,
  };

  const caseRes = await sb("cases", {
    method: "POST",
    body: JSON.stringify(casePayload),
    headers: { Prefer: "return=representation" },
  });

  if (!caseRes.ok) {
    console.error("[vera/email/webhook] case insert failed:", await caseRes.text());
    return NextResponse.json({ error: "case_insert_failed" }, { status: 502 });
  }

  const [createdCase] = await caseRes.json();
  const case_id: string = createdCase.id;

  // Initial message with full email metadata
  await sb("case_messages", {
    method: "POST",
    body: JSON.stringify({
      workspace_id: DOGFOOD_WORKSPACE_ID,
      case_id,
      role: "customer",
      content: pkg.description,
      metadata: {
        channel: "email",
        thread_id: threadId,
        message_id: msg.message_id,
        subject,
        product_tag: productTag,
        has_attachments: msg.has_attachments ?? false,
        sentiment,
        inbox_id: msg.inbox_id,
      },
    }),
  });

  // Audit: case created from email
  await sb("actions_audit", {
    method: "POST",
    body: JSON.stringify({
      workspace_id: DOGFOOD_WORKSPACE_ID,
      case_id,
      action_type: "email_intake",
      actor: "vera",
      target: senderEmail,
      payload: { thread_id: threadId, message_id: msg.message_id, product_tag: productTag },
      outcome: "success",
    }),
  });

  // Trigger resolution pipeline (fire-and-forget — don't block webhook response)
  const pipelineUrl = `${process.env.MC_URL ?? "http://localhost:3000"}/api/vera/pipeline/process`;
  fetch(pipelineUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ case_id }),
  }).catch((err) => console.error("[vera/email/webhook] pipeline trigger failed:", err));

  return NextResponse.json({ ok: true, case_id, action: "case_created" }, { status: 201 });
}
