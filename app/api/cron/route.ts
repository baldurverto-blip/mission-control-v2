import { NextResponse } from "next/server";
import { getCronList } from "@/app/lib/openclaw-cache";

export async function GET() {
  try {
    const { jobs } = await getCronList();

    const healthy = jobs.filter(
      (j) => j.enabled && j.state.lastRunStatus === "ok"
    ).length;

    return NextResponse.json({
      jobs,
      total: jobs.length,
      healthy,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to run openclaw cron list", detail: String(err) },
      { status: 500 }
    );
  }
}
