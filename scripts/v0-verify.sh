#!/usr/bin/env bash
# One-shot verification of builder v0 Phase 0/1 claims (read-only + dry runs).
# Self-contained PATH setup, same convention as dev-web.sh — works from any shell.
set -euo pipefail

export PATH="$HOME/.nvm/versions/node/v22.15.0/bin:$HOME/bin:$PATH"
DOPPLER="$HOME/bin/doppler"
cd "$(dirname "$0")/.."

# Dev-only harness: refuse to run against the production Supabase project.
"$DOPPLER" run --project tela --config dev -- bash scripts/lib/assert-not-prod.sh

echo "══════════════════════════════════════════════════════════"
echo "1/3  Unit tests (P3 reconciliation + entitlements truth table)"
echo "══════════════════════════════════════════════════════════"
pnpm --filter @tela/capabilities test

echo
echo "══════════════════════════════════════════════════════════"
echo "2/3  Presentation backfill — dry run (expect: 0 items need classification)"
echo "══════════════════════════════════════════════════════════"
"$DOPPLER" run --project tela --config dev -- pnpm --filter @tela/capabilities exec tsx scripts/backfill-presentation.ts

echo
echo "══════════════════════════════════════════════════════════"
echo "3/3  Founder flag flip — dry run (shows before/after, writes NOTHING)"
echo "══════════════════════════════════════════════════════════"
"$DOPPLER" run --project tela --config dev -- pnpm --filter @tela/capabilities exec tsx scripts/set-user-feature.ts --email luke@lukegorski.com --key builder --value true

echo
echo "All three checks completed."
