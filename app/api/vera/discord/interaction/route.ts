/**
 * POST /api/vera/discord/interaction
 *
 * Discord interaction webhook — handles button clicks from T2 alert messages.
 *
 * Week 3: skeleton with Ed25519 signature verification.
 * Week 5: wire up vera_approve_{case_id}, vera_edit_{case_id}, vera_escalate_{case_id}.
 *
 * Custom IDs:
 *   vera_approve_{case_id}   — operator approves Vera's T2 draft, sends reply
 *   vera_edit_{case_id}      — opens MC queue detail for manual edit
 *   vera_escalate_{case_id}  — escalates to T3
 *
 * Discord interaction window: 15 minutes.
 * Expired-interaction fallback: redirect to MC dashboard.
 *
 * Security: Discord signs all interaction payloads with Ed25519.
 * DISCORD_PUBLIC_KEY must be set in env.
 */

import { NextRequest, NextResponse } from "next/server";

const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;

// ── Ed25519 signature verification ───────────────────────────────────────────

async function verifyDiscordSignature(
  req: NextRequest,
  body: string
): Promise<boolean> {
  if (!DISCORD_PUBLIC_KEY) {
    console.error("[vera/discord/interaction] DISCORD_PUBLIC_KEY not set");
    return false;
  }

  const signature = req.headers.get("x-signature-ed25519");
  const timestamp = req.headers.get("x-signature-timestamp");
  if (!signature || !timestamp) return false;

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      hexToBytes(DISCORD_PUBLIC_KEY),
      { name: "Ed25519" },
      false,
      ["verify"]
    );

    const message = new TextEncoder().encode(timestamp + body);
    const sigBytes = hexToBytes(signature);

    return await crypto.subtle.verify("Ed25519", key, sigBytes, message);
  } catch {
    return false;
  }
}

function hexToBytes(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes.buffer as ArrayBuffer;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.text();

  // Discord requires signature verification — reject if invalid
  const valid = await verifyDiscordSignature(req, body);
  if (!valid) {
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Discord PING — must respond immediately
  if (payload.type === 1) {
    return NextResponse.json({ type: 1 });
  }

  // Message component interactions (button clicks)
  if (payload.type === 3) {
    const customId = (payload as { data?: { custom_id?: string } }).data?.custom_id ?? "";

    if (customId.startsWith("vera_approve_")) {
      const caseId = customId.replace("vera_approve_", "");
      // TODO (Week 5): approve T2 draft, send reply via original channel
      console.log(`[vera/discord/interaction] approve requested for case ${caseId}`);
      return NextResponse.json({
        type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
        data: {
          content: `✓ Opening case in Mission Control: ${process.env.MC_URL}/vera/queue?case=${caseId}`,
          flags: 64, // EPHEMERAL
        },
      });
    }

    if (customId.startsWith("vera_edit_")) {
      const caseId = customId.replace("vera_edit_", "");
      return NextResponse.json({
        type: 4,
        data: {
          content: `Edit in Mission Control: ${process.env.MC_URL}/vera/queue?case=${caseId}`,
          flags: 64,
        },
      });
    }

    if (customId.startsWith("vera_escalate_")) {
      const caseId = customId.replace("vera_escalate_", "");
      // TODO (Week 5): set tier=T3, notify Mads
      return NextResponse.json({
        type: 4,
        data: {
          content: `Case escalated to T3: ${process.env.MC_URL}/vera/queue?case=${caseId}`,
          flags: 64,
        },
      });
    }

    // Unknown interaction — acknowledge silently
    return NextResponse.json({ type: 1 });
  }

  return NextResponse.json({ type: 1 });
}
