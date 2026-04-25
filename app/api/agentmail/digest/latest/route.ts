import { NextResponse } from "next/server";
import { readFile, readdir } from "fs/promises";
import { AGENTMAIL_DIGEST_DIR } from "@/app/lib/paths";

export async function GET() {
  try {
    const latestDigest = (await readdir(AGENTMAIL_DIGEST_DIR).catch(() => [] as string[]))
      .filter((name) => name.endsWith(".md"))
      .sort()
      .at(-1);

    if (!latestDigest) {
      return NextResponse.json({ error: "No AgentMail digest available yet" }, { status: 404 });
    }

    const content = await readFile(`${AGENTMAIL_DIGEST_DIR}/${latestDigest}`, "utf-8");
    return new NextResponse(content, {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `inline; filename="${latestDigest}"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to read latest AgentMail digest", detail: String(err) },
      { status: 500 }
    );
  }
}
