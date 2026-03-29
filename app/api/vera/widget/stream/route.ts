/**
 * GET /api/vera/widget/stream?session_token={token}&case_id={id}
 *
 * Server-Sent Events stream for widget reply delivery.
 *
 * Week 2: stream opens, sends initial connection event, then heartbeats every 25s.
 * Week 4: resolution pipeline hooks in here to push Vera's reply when ready.
 *
 * Client reconnect: exponential backoff (1s → 2s → 4s), max 5 retries.
 * After 5 retries, widget displays "Check your email for a response."
 */

import { NextRequest } from "next/server";

export const runtime = "nodejs";
// SSE connections must not be cached
export const dynamic = "force-dynamic";

const HEARTBEAT_INTERVAL_MS = 25_000;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const session_token = searchParams.get("session_token");
  const case_id = searchParams.get("case_id");

  if (!session_token || !case_id) {
    return new Response("session_token and case_id required", { status: 400 });
  }

  const encoder = new TextEncoder();

  function sse(event: string, data: unknown): Uint8Array {
    return encoder.encode(
      `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
    );
  }

  const stream = new ReadableStream({
    start(controller) {
      // Initial connection confirmation
      controller.enqueue(
        sse("connected", {
          case_id,
          message:
            "Vera received your request. Hang tight — a response is on its way.",
        })
      );

      // Heartbeat to keep the connection alive through proxies + CDN
      const hb = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          clearInterval(hb);
        }
      }, HEARTBEAT_INTERVAL_MS);

      // TODO (Week 4): resolution pipeline publishes reply events here.
      // Pattern: poll Supabase for case_messages WHERE case_id=? AND role=vera
      // and push via controller.enqueue(sse("reply", { content, created_at })).
      // Use a dedicated Supabase Realtime subscription or a short-interval poll.

      req.signal.addEventListener("abort", () => {
        clearInterval(hb);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable Nginx buffering
    },
  });
}
