import { NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { WORKSPACE } from "../../../lib/paths";

const SCHEDULE_PATH = join(WORKSPACE, "company", "content", "schedule.json");

export async function GET() {
  if (!existsSync(SCHEDULE_PATH)) {
    return NextResponse.json({ error: "schedule.json not found" }, { status: 404 });
  }
  try {
    const schedule = JSON.parse(readFileSync(SCHEDULE_PATH, "utf-8"));
    return NextResponse.json(schedule);
  } catch (e) {
    return NextResponse.json({ error: "Failed to read schedule" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    // Validate structure
    if (!body.lanes || !body.channels) {
      return NextResponse.json({ error: "Invalid schedule format: needs lanes and channels" }, { status: 400 });
    }
    // Ensure directory exists
    const dir = dirname(SCHEDULE_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(SCHEDULE_PATH, JSON.stringify(body, null, 2));
    return NextResponse.json({ success: true, schedule: body });
  } catch (e) {
    return NextResponse.json({ error: "Failed to save schedule" }, { status: 500 });
  }
}
