#!/bin/bash
# Rebuild Mission Control standalone production build
# Usage: ./scripts/rebuild.sh
# After rebuild, restart the LaunchAgent:
#   launchctl unload ~/Library/LaunchAgents/com.verto.mission-control.plist
#   launchctl load ~/Library/LaunchAgents/com.verto.mission-control.plist

set -euo pipefail

PROJECT_DIR="/Users/baldurclaw/projects/mission-control-v2"
cd "$PROJECT_DIR"

echo "[rebuild] Building Mission Control (production standalone)..."
npm run build

echo "[rebuild] Linking static assets..."
ln -sfn "$PROJECT_DIR/.next/static" "$PROJECT_DIR/.next/standalone/.next/static"
ln -sfn "$PROJECT_DIR/public" "$PROJECT_DIR/.next/standalone/public"

echo "[rebuild] Done. Restart LaunchAgent to pick up changes:"
echo "  launchctl unload ~/Library/LaunchAgents/com.verto.mission-control.plist"
echo "  launchctl load ~/Library/LaunchAgents/com.verto.mission-control.plist"
