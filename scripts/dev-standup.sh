#!/usr/bin/env bash
# Stand up (or repair) a NON-PRODUCTION tela environment end to end:
# migrations → manual SQL (RLS + hardening) → storage buckets → seeds → audit.
# Idempotent: every step skips or upserts what already exists.
#
# The reusable artifact from the dev-environment split (2026-07-14) — future
# environments (stg) run the same script with a different config.
#
#   bash scripts/dev-standup.sh          # target = doppler config "dev"
#   bash scripts/dev-standup.sh stg      # target = another NON-PROD config
#
# Refuses to touch the production Supabase project (scripts/lib/assert-not-prod.sh).
set -euo pipefail

export PATH="$HOME/.nvm/versions/node/v22.15.0/bin:$HOME/bin:$PATH"
DOPPLER="$HOME/bin/doppler"
cd "$(dirname "$0")/.."

CONFIG="${1:-dev}"
run() { "$DOPPLER" run --project tela --config "$CONFIG" -- "$@"; }

echo "══ guard: refusing production targets"
run bash scripts/lib/assert-not-prod.sh

echo "══ 1/5 drizzle migrations"
# pnpm --filter (not the root turbo task): turbo strict env strips DATABASE_URL
run pnpm --filter @tela/db db:migrate

echo "══ 2/5 manual SQL (RLS, grants, hardening)"
run node packages/db/scripts/apply-manual.mjs

echo "══ 3/5 storage buckets"
run node packages/capabilities/scripts/setup-app-buckets.mjs
run node packages/capabilities/scripts/setup-models-bucket.mjs

echo "══ 4/5 seeds (prompts, stylist content, rate limits, eval user)"
# prompts:sync + stylist seed need @tela/db built (cold worktrees have no dists)
pnpm --filter @tela/db build
run pnpm --filter @tela/prompts prompts:sync
run node packages/db/scripts/seed-stylist-content.mjs
run node packages/db/scripts/seed-rate-limits.mjs
run node packages/db/scripts/seed-eval-user.mjs

echo "══ 5/5 verification audit"
run node packages/db/scripts/verify-standup.mjs
