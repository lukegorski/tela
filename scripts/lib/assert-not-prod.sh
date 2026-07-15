#!/usr/bin/env bash
# Guard: refuse to run when the injected env points at PRODUCTION Supabase.
# Source of truth for the prod ref: docs/dev-environment-split-plan.md (2026-07-14).
# Used by dev-standup and any script that MUTATES the target database/storage.
set -euo pipefail

PROD_REF="cyupcwfvtbfkupbdcoql"

for v in SUPABASE_URL DATABASE_URL; do
  val="${!v:-}"
  if [ -z "$val" ]; then
    echo "assert-not-prod: $v is empty — run via doppler (refusing to guess)" >&2
    exit 1
  fi
  case "$val" in
    *"$PROD_REF"*)
      echo "assert-not-prod: $v points at PRODUCTION ($PROD_REF) — refusing." >&2
      exit 1
      ;;
  esac
done

ref="${SUPABASE_URL#https://}"
echo "assert-not-prod: OK — target project ref: ${ref%%.*}"
