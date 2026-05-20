#!/usr/bin/env bash
# Boot the admin app locally against Doppler dev env vars.
# Uses absolute paths so PATH issues / bracketed-paste don't bite.
set -euo pipefail

DOPPLER="$HOME/bin/doppler"
PNPM="$HOME/.nvm/versions/node/v22.15.0/bin/pnpm"

cd "$(dirname "$0")/.."

exec "$DOPPLER" run --project tela --config dev -- "$PNPM" --filter @tela/admin dev
