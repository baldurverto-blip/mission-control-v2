#!/bin/bash
# Rebuild Mission Control standalone production build and restart the server.
# Usage: ./scripts/rebuild.sh
#
# This script builds, symlinks static assets, and restarts the LaunchAgent
# so the running server always serves the current CSS/JS bundles.

set -euo pipefail

PROJECT_DIR="/Users/baldurclaw/projects/mission-control-v2"
PLIST="$HOME/Library/LaunchAgents/com.verto.mission-control.plist"

cd "$PROJECT_DIR"

echo "[rebuild] Building Mission Control (production standalone)..."
npm run build

echo "[rebuild] Linking static assets..."
ln -sfn "$PROJECT_DIR/.next/static" "$PROJECT_DIR/.next/standalone/.next/static"
ln -sfn "$PROJECT_DIR/public" "$PROJECT_DIR/.next/standalone/public"

echo "[rebuild] Restarting LaunchAgent..."
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

echo "[rebuild] Done. Server restarted on port 3000."
