#!/usr/bin/env bash
# Run the builder-v0 stack for founder dogfood: local api (3004) + web (3001).
# Self-contained PATH (same convention as dev-web.sh) — run from any shell:
#   bash /Users/lukegorski/tela/.claude/worktrees/builder-v0/scripts/dev-builder.sh
# Ctrl-C stops both. Survives Claude sessions — it's your process.
set -euo pipefail

export PATH="$HOME/.nvm/versions/node/v22.15.0/bin:$HOME/bin:$PATH"
DOPPLER="$HOME/bin/doppler"
cd "$(dirname "$0")/.."

API_PID=""
cleanup() { [ -n "$API_PID" ] && kill "$API_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

if lsof -nP -iTCP:3004 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "api already listening on 3004 — reusing it"
else
  echo "starting api on 3004…"
  "$DOPPLER" run --project tela --config dev -- env PORT=3004 pnpm --filter @tela/api dev &
  API_PID=$!
fi

if lsof -nP -iTCP:3001 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "ERROR: port 3001 already in use — stop that process first (lsof -nP -iTCP:3001)" >&2
  exit 1
fi

echo "starting web on 3001 (api → http://localhost:3004)…"
exec "$DOPPLER" run --project tela --config dev -- \
  env NEXT_PUBLIC_API_URL=http://localhost:3004 \
  pnpm --filter @tela/web exec next dev --port 3001
