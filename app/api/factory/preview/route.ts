import { NextRequest, NextResponse } from "next/server";
import { spawn, execSync } from "child_process";
import QRCode from "qrcode";

const PROJECTS_DIR = `${process.env.HOME ?? "/Users/baldurclaw"}/projects`;

// Track running expo servers per slug
const runningServers: Map<string, { pid: number; port: number; startedAt: number }> = new Map();

function getLocalIP(): string {
  try {
    const result = execSync("ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null", { encoding: "utf-8" }).trim();
    return result || "127.0.0.1";
  } catch {
    return "127.0.0.1";
  }
}

function isPortInUse(port: number): boolean {
  try {
    execSync(`lsof -i :${port} -t 2>/dev/null`, { encoding: "utf-8" });
    return true;
  } catch {
    return false;
  }
}

function findExpoPort(slug: string): number | null {
  try {
    const pids = execSync(`pgrep -f "expo start.*${slug}" 2>/dev/null || pgrep -f "expo.*${slug}" 2>/dev/null`, { encoding: "utf-8" }).trim();
    if (!pids) return null;
    // Check common expo ports
    for (const port of [8081, 8082, 8083, 8084, 8085]) {
      if (isPortInUse(port)) return port;
    }
  } catch { /* no expo running */ }
  return null;
}

// POST: start expo dev server
export async function POST(req: NextRequest) {
  const { slug } = await req.json();
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

  const projectDir = `${PROJECTS_DIR}/${slug}`;
  const ip = getLocalIP();

  // Check if already running
  const existing = runningServers.get(slug);
  if (existing) {
    try {
      process.kill(existing.pid, 0); // check if alive
      const expoUrl = `exp://${ip}:${existing.port}`;
      const qr = await QRCode.toDataURL(expoUrl, { width: 256, margin: 2, color: { dark: "#2A2520", light: "#F5F0E8" } });
      return NextResponse.json({ status: "running", url: expoUrl, qr, port: existing.port, ip });
    } catch {
      runningServers.delete(slug);
    }
  }

  // Check if expo is already running for this project (started externally)
  const existingPort = findExpoPort(slug);
  if (existingPort) {
    const expoUrl = `exp://${ip}:${existingPort}`;
    const qr = await QRCode.toDataURL(expoUrl, { width: 256, margin: 2, color: { dark: "#2A2520", light: "#F5F0E8" } });
    return NextResponse.json({ status: "running", url: expoUrl, qr, port: existingPort, ip });
  }

  // Find an available port
  let port = 8081;
  for (let p = 8081; p <= 8090; p++) {
    if (!isPortInUse(p)) { port = p; break; }
  }

  // Start expo
  try {
    const child = spawn("npx", ["expo", "start", "--port", String(port), "--lan"], {
      cwd: projectDir,
      detached: true,
      stdio: "ignore",
      env: { ...process.env, BROWSER: "none" },
    });
    child.unref();

    runningServers.set(slug, { pid: child.pid!, port, startedAt: Date.now() });

    // Wait a moment for expo to start, then return the QR
    await new Promise((r) => setTimeout(r, 3000));

    const expoUrl = `exp://${ip}:${port}`;
    const qr = await QRCode.toDataURL(expoUrl, { width: 256, margin: 2, color: { dark: "#2A2520", light: "#F5F0E8" } });

    return NextResponse.json({ status: "starting", url: expoUrl, qr, port, ip, pid: child.pid });
  } catch (err) {
    return NextResponse.json({ error: `Failed to start: ${err}` }, { status: 500 });
  }
}

// DELETE: stop expo dev server
export async function DELETE(req: NextRequest) {
  const { slug } = await req.json();
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

  const server = runningServers.get(slug);
  if (server) {
    try { process.kill(-server.pid, "SIGTERM"); } catch { /* already dead */ }
    runningServers.delete(slug);
  }
  // Also kill any expo processes for this slug
  try { execSync(`pkill -f "expo.*${slug}" 2>/dev/null`); } catch { /* none running */ }

  return NextResponse.json({ status: "stopped" });
}
