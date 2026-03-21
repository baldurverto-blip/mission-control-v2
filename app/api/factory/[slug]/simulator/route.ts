import { NextResponse } from "next/server";
import { spawn, execSync } from "child_process";
import { join } from "path";
import { readFile } from "fs/promises";
import { existsSync } from "fs";

const HOME = process.env.HOME ?? "/Users/baldurclaw";
const PROJECTS = join(HOME, "projects");
const FACTORY = join(HOME, "verto-workspace/ops/factory");
const SIM_UDID = "E1E81272-0259-4D72-B18A-EB41972F39D3"; // iPhone 17 Pro

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    if (!slug) {
      return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    }

    const projectDir = join(PROJECTS, slug);
    if (!existsSync(projectDir)) {
      return NextResponse.json(
        { error: `Project directory not found: ~/projects/${slug}` },
        { status: 404 }
      );
    }

    // Read app.json to get bundle identifier
    const appJsonPath = join(projectDir, "app.json");
    if (!existsSync(appJsonPath)) {
      return NextResponse.json(
        { error: "app.json not found — not an Expo project?" },
        { status: 400 }
      );
    }
    const appJson = JSON.parse(await readFile(appJsonPath, "utf-8"));
    const bundleId = appJson.expo?.ios?.bundleIdentifier;
    const appName = appJson.expo?.name ?? slug;

    if (!bundleId) {
      return NextResponse.json(
        { error: "No ios.bundleIdentifier in app.json" },
        { status: 400 }
      );
    }

    // Boot simulator if not already booted
    try {
      execSync(`xcrun simctl boot ${SIM_UDID} 2>/dev/null || true`);
    } catch { /* already booted */ }

    // Open Simulator.app to make it visible
    execSync("open -a Simulator");

    // Log file for build output
    const logDir = join(FACTORY, slug);
    const logFile = join(logDir, `simulator-build-${Date.now()}.log`);

    // Build script that prebuilds, builds, installs, and launches
    const script = `#!/bin/bash
set -euo pipefail
exec > "${logFile}" 2>&1

# Fix CocoaPods Ruby 4.0 unicode encoding issue
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

echo "[simulator] Starting build for ${slug} at $(date)"

cd "${projectDir}"

# Step 0: Ensure react-native-worklets is installed (reanimated 4.x requirement)
if node -e "require('react-native-reanimated/scripts/validate-worklets-build.js')" 2>/dev/null; then
  echo "[simulator] Worklets OK"
else
  if ! node node_modules/react-native-reanimated/scripts/validate-worklets-build.js 2>/dev/null; then
    echo "[simulator] Installing react-native-worklets (reanimated 4.x dependency)..."
    npm install react-native-worklets@0.5 --legacy-peer-deps 2>&1
  fi
fi

# Step 1: Prebuild
echo "[simulator] Running expo prebuild..."
npx expo prebuild --platform ios --clean 2>&1 || {
  echo "[simulator] Prebuild failed, trying without --clean..."
  npx expo prebuild --platform ios 2>&1
}

# Step 2: Find workspace and scheme
WORKSPACE=$(ls -d ios/*.xcworkspace 2>/dev/null | head -1)
if [ -z "$WORKSPACE" ]; then
  echo "[simulator] ERROR: No .xcworkspace found after prebuild"
  exit 1
fi
SCHEME=$(basename "$WORKSPACE" .xcworkspace)
echo "[simulator] Building scheme: $SCHEME from $WORKSPACE"

# Step 3: Build for simulator
DERIVED_DATA="${logDir}/build/DerivedData"
mkdir -p "$DERIVED_DATA"
echo "[simulator] Building with xcodebuild (this may take a few minutes)..."
xcodebuild \\
  -workspace "$WORKSPACE" \\
  -scheme "$SCHEME" \\
  -configuration Debug \\
  -destination "id=${SIM_UDID}" \\
  -derivedDataPath "$DERIVED_DATA" \\
  COMPILER_INDEX_STORE_ENABLE=NO \\
  ONLY_ACTIVE_ARCH=YES \\
  CODE_SIGNING_ALLOWED=NO \\
  -quiet 2>&1

# Step 4: Find and install .app
APP_PATH=$(find "$DERIVED_DATA" -name "*.app" -not -path "*/Test*" -type d | head -1)
if [ -z "$APP_PATH" ]; then
  echo "[simulator] ERROR: No .app bundle found in DerivedData"
  exit 1
fi
echo "[simulator] Installing: $APP_PATH"
xcrun simctl install ${SIM_UDID} "$APP_PATH"

# Step 5: Launch
echo "[simulator] Launching ${bundleId}..."
xcrun simctl terminate ${SIM_UDID} "${bundleId}" 2>/dev/null || true
xcrun simctl launch ${SIM_UDID} "${bundleId}"

echo "[simulator] Done! ${appName} is running on iPhone 17 Pro simulator."

# Cleanup DerivedData to save disk
echo "[simulator] Cleaning up DerivedData..."
rm -rf "$DERIVED_DATA"
echo "[simulator] Build complete at $(date)"
`;

    // Write and execute the build script
    const scriptPath = join(logDir, "simulator-build.sh");
    const { writeFileSync } = require("fs");
    writeFileSync(scriptPath, script, { mode: 0o755 });

    const env = { ...process.env } as NodeJS.ProcessEnv;
    delete env.CLAUDECODE;

    const child = spawn("bash", [scriptPath], {
      detached: true,
      stdio: "ignore",
      env,
      cwd: projectDir,
    });
    child.unref();

    return NextResponse.json({
      status: "building",
      message: `Building ${appName} for simulator. This takes 2-5 minutes.`,
      pid: child.pid,
      logFile,
      bundleId,
      simulator: "iPhone 17 Pro",
    });
  } catch (err) {
    console.error("Simulator launch error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET: Check if a simulator build is running or get last build status
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const logDir = join(FACTORY, slug);

    // Find most recent simulator log
    const { readdirSync } = require("fs");
    const files: string[] = readdirSync(logDir).filter((f: string) =>
      f.startsWith("simulator-build-") && f.endsWith(".log")
    );

    if (files.length === 0) {
      return NextResponse.json({ status: "none", message: "No simulator builds found" });
    }

    files.sort().reverse();
    const latestLog = join(logDir, files[0]);
    const content = await readFile(latestLog, "utf-8");
    const lines = content.trim().split("\n");
    const lastLine = lines[lines.length - 1] ?? "";

    const isDone = lastLine.includes("Build complete") || lastLine.includes("Done!");
    const hasError = lines.some((l: string) => l.includes("ERROR:"));

    // Check if build process is still running
    let isRunning = false;
    try {
      execSync(`pgrep -f "simulator-build.sh.*" 2>/dev/null`, { encoding: "utf-8" });
      isRunning = true;
    } catch { /* not running */ }

    return NextResponse.json({
      status: hasError ? "error" : isDone ? "complete" : isRunning ? "building" : "unknown",
      lastLine,
      logFile: latestLog,
    });
  } catch {
    return NextResponse.json({ status: "none" });
  }
}
