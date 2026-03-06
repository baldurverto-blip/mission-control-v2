import { NextResponse } from "next/server";
import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve } from "path";

const LOG_DIR = resolve(
  process.env.HOME || "/Users/baldurclaw",
  "verto-workspace/research/idea-proposals",
);

const QUEUE_PATH = resolve(
  process.env.HOME || "/Users/baldurclaw",
  "verto-workspace/ops/factory/idea-queue.json",
);

/** GET /api/growth/ideas — return idea generation logs + current queue */
export async function GET() {
  try {
    // Load logs (most recent first)
    let logs: unknown[] = [];
    if (existsSync(LOG_DIR)) {
      const files = readdirSync(LOG_DIR)
        .filter((f) => f.endsWith(".json"))
        .sort()
        .reverse()
        .slice(0, 10);

      for (const file of files) {
        try {
          const raw = JSON.parse(
            readFileSync(resolve(LOG_DIR, file), "utf-8"),
          );
          const entries = Array.isArray(raw) ? raw : [raw];
          for (const entry of entries) {
            logs.push({ ...entry, _file: file });
          }
        } catch {
          // skip corrupt files
        }
      }
    }

    // Load current queue
    let queue = null;
    if (existsSync(QUEUE_PATH)) {
      try {
        queue = JSON.parse(readFileSync(QUEUE_PATH, "utf-8"));
      } catch {
        // ignore
      }
    }

    return NextResponse.json({ success: true, logs, queue });
  } catch (e) {
    return NextResponse.json(
      {
        success: false,
        error: e instanceof Error ? e.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
