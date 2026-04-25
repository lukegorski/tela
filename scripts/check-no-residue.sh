#!/usr/bin/env bash
# scripts/check-no-residue.sh
#
# Enforces the "no residue" rule from PORT.md. Greps the new web app
# (apps/web/src/) for patterns that mean we're carrying legacy
# Firebase/Firestore concepts forward — which would defeat the point
# of the rebuild and prevent us from deleting /Users/lukegorski/ale
# cleanly.
#
# Run standalone:
#   bash scripts/check-no-residue.sh
#
# Or via the root verify command:
#   pnpm verify
#
# Exits 0 if clean, 1 if any forbidden pattern is found.
#
# When a check fails, fix the source — DON'T loosen the check. The
# allowlist of "architecturally new" routes is intentionally tiny:
#   /api/trpc/*              — the tRPC router
#   /auth/callback/*         — Supabase OAuth callback
#   /auth/sign-out/*         — sign-out POST handler
#   /chat/stream/*           — SSE endpoint for streaming chat
# Anything else under apps/web/src/app/api/ is residue. See PORT.md
# section "The golden no-residue rule" for the full table.
#
# Implementation notes:
# - Uses plain POSIX grep -E (no ripgrep dependency, no PCRE extensions)
#   so it runs on macOS BSD grep + Linux GNU grep + CI without setup.
# - Globs to .ts/.tsx/.js/.jsx/.mjs/.cjs only. Markdown / JSON /
#   config files are intentionally excluded — docs may legitimately
#   mention "firebase" or "Timestamp" while explaining the migration.

set -euo pipefail

# --- locate repo root ---------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

WEB_SRC="apps/web/src"

if [[ ! -d "${WEB_SRC}" ]]; then
  echo "check-no-residue: ${WEB_SRC} not found — run from repo root" >&2
  exit 2
fi

# --- collect failures, report at end ------------------------------------------
FAILURES=0
RED=$'\033[0;31m'
YELLOW=$'\033[0;33m'
GREEN=$'\033[0;32m'
BOLD=$'\033[1m'
NC=$'\033[0m'

# Run grep with the standard include set, then filter out lines whose
# match falls in a JSDoc / line comment (those exist to DOCUMENT the
# legacy → new data-layer swap and shouldn't trip the check).
#
# grep output format is "path:lineno:content". A line is considered a
# pure comment line if `content`, after leading whitespace, starts
# with one of:  * (JSDoc continuation),  // (line comment),
# /* (block comment start),  /** (JSDoc opener).
#
# The filter regex is anchored ^path:lineno: rather than just `:` —
# otherwise a stray `://` in a URL string would be misread as a `//`
# line comment marker. Repo paths don't contain colons, so [^:]+
# safely captures the path segment.
#
# Returns matches on stdout, or nothing if clean. Always exits 0 (we
# use `|| true`-style handling so "no matches" doesn't trip set -e).
grep_web() {
  local pattern="$1"
  grep -rEn "${pattern}" \
    --include='*.ts' --include='*.tsx' \
    --include='*.js' --include='*.jsx' \
    --include='*.mjs' --include='*.cjs' \
    "${WEB_SRC}" 2>/dev/null \
    | grep -Ev '^[^:]+:[0-9]+:[[:space:]]*(\*|//|/\*)' \
    || true
}

fail() {
  local label="$1"
  local explanation="$2"
  local matches="$3"
  printf "%s%s✗ %s%s\n" "${RED}" "${BOLD}" "${label}" "${NC}"
  printf "  %s\n" "${explanation}"
  printf "  Offending matches:\n"
  printf "%s\n" "${matches}" | sed 's/^/    /'
  echo
  FAILURES=$((FAILURES + 1))
}

pass() {
  printf "%s✓%s %s\n" "${GREEN}" "${NC}" "$1"
}

echo "Checking ${WEB_SRC}/ for legacy residue..."
echo

# --- Check 1: firebase imports ------------------------------------------------
# Catches: firebase, firebase/auth, firebase/firestore, firebase/storage,
# firebase-admin, firebase-admin/*, @firebase/*, react-firebase-hooks.
#
# A literal-copy port that compiles "for free" by adding firebase as a
# dependency is the #1 anti-pattern. The whole point of the rebuild is
# to NOT depend on firebase. Surgically edit imports + access patterns
# instead.
#
# Pattern: from "firebase..." | from "@firebase/..." | from
# "firebase-admin..." | from "react-firebase-hooks...". Single OR
# double quotes accepted.
FIREBASE_RE='from[[:space:]]+["'\''](firebase($|/|-admin)|@firebase/|react-firebase-hooks)'
FIREBASE_HITS="$(grep_web "${FIREBASE_RE}")"
if [[ -n "${FIREBASE_HITS}" ]]; then
  fail "firebase / firebase-admin import detected" \
    "No file in ${WEB_SRC} may import from any firebase package. Use Supabase + tRPC instead. See PORT.md → 'The golden no-residue rule'." \
    "${FIREBASE_HITS}"
else
  pass "no firebase imports"
fi

# --- Check 2: legacy /api/* mirroring routes ----------------------------------
# Allowlist: /api/trpc, /api/auth/callback, /api/auth/sign-out, /api/chat/stream.
# Anything else under apps/web/src/app/api/ is a legacy mirror.
#
# We list every route handler under apps/web/src/app/api/, strip the
# allowlisted subtrees, and fail on whatever's left.
API_DIR="${WEB_SRC}/app/api"
if [[ -d "${API_DIR}" ]]; then
  STRAY_API="$(find "${API_DIR}" \
      \( -name 'route.ts' -o -name 'route.tsx' -o -name 'route.js' -o -name 'route.mjs' \) \
      2>/dev/null \
    | grep -Ev '^apps/web/src/app/api/(trpc|auth/callback|auth/sign-out|chat/stream)(/|$)' \
    || true)"
  if [[ -n "${STRAY_API}" ]]; then
    fail "stray /api/* route handlers detected" \
      "Only /api/trpc, /api/auth/callback, /api/auth/sign-out, and /api/chat/stream are allowed. Move data fetching to tRPC capabilities. See PORT.md → 'The golden no-residue rule'." \
      "${STRAY_API}"
  else
    pass "no stray /api/* routes (allowlist: /trpc, /auth/callback, /auth/sign-out, /chat/stream)"
  fi
else
  pass "no /api/ directory at all (clean)"
fi

# --- Check 3: client-side fetches to legacy /api/* paths ----------------------
# Even without the route handlers existing, a stray fetch('/api/wardrobe')
# means a component still thinks it's calling the legacy backend. Catches
# fetch('/api/...'), useSWR('/api/...'), etc. Single quotes, double quotes,
# and template literal backticks all covered.
LEGACY_FETCH_RE='["'\''`]/api/(wardrobe|outfits|chat|translate|profile|enhance|tryon|items|rules|prompts|admin|cost|generate|analyze|usage|costs)'
LEGACY_FETCH_HITS="$(grep_web "${LEGACY_FETCH_RE}")"
if [[ -n "${LEGACY_FETCH_HITS}" ]]; then
  fail "client-side fetch to legacy /api/* path" \
    "Components should call tRPC capabilities, not legacy /api/* URLs. Replace with trpc.capability.execute.useMutation({ name: '...', input: {...} })." \
    "${LEGACY_FETCH_HITS}"
else
  pass "no client-side fetches to legacy /api/* paths"
fi

# --- Check 4: Firestore Timestamp type ----------------------------------------
# Timestamp is a Firestore concept. Components should consume Date or ISO
# string. If a port still imports / type-annotates with Timestamp, the
# data-layer swap is incomplete.
#
# Word-boundary anchored to avoid matching "timestamp" (lowercase) which
# is a normal field name on our schema, or "Timestamps" inside copy.
TIMESTAMP_RE='[^[:alnum:]_]Timestamp[^[:alnum:]_s]'
TIMESTAMP_HITS="$(grep_web "${TIMESTAMP_RE}")"
if [[ -n "${TIMESTAMP_HITS}" ]]; then
  fail "Firestore Timestamp type usage detected" \
    "Timestamp is a Firestore concept. Use Date (or ISO string) in components. Capability outputs return ISO strings — wrap with new Date(...) at the consumption site." \
    "${TIMESTAMP_HITS}"
else
  pass "no Firestore Timestamp usage"
fi

# --- Check 5: Firestore client SDK call surface -------------------------------
# Catches Firestore SDK calls even if the import is somehow obscured:
# getFirestore(), onSnapshot(), getDoc(), getDocs(), setDoc(), updateDoc(),
# deleteDoc(), addDoc(), serverTimestamp(), writeBatch(), runTransaction().
# Requires a function-call shape (`name(`) so we don't false-match on
# variable names or comments.
FIRESTORE_RE='[^[:alnum:]_](getFirestore|onSnapshot|getDoc|getDocs|setDoc|updateDoc|deleteDoc|addDoc|serverTimestamp|writeBatch|runTransaction)[[:space:]]*\('
FIRESTORE_HITS="$(grep_web "${FIRESTORE_RE}")"
if [[ -n "${FIRESTORE_HITS}" ]]; then
  fail "Firestore SDK call detected" \
    "These components are still calling the Firestore SDK. Replace with tRPC capability calls (trpc.capability.execute.useMutation / .useQuery)." \
    "${FIRESTORE_HITS}"
else
  pass "no Firestore SDK calls"
fi

# --- Check 6: Firebase storage / hosting URL fragments ------------------------
# Hardcoded firebasestorage.googleapis.com or firebaseapp.com URLs would
# mean we're still serving content out of Firebase Storage rather than
# Supabase Storage. Docs (markdown) may legitimately reference these
# URLs while explaining the migration; we only check app code.
FIREBASE_URL_RE='(firebasestorage\.googleapis\.com|firebaseapp\.com|firebaseio\.com)'
FIREBASE_URL_HITS="$(grep_web "${FIREBASE_URL_RE}")"
if [[ -n "${FIREBASE_URL_HITS}" ]]; then
  fail "hardcoded Firebase URL detected" \
    "User content should be served via Supabase Storage signed URLs (returned by wardrobe.requestPhotoUpload / capability outputs). No firebase.com URLs in app code." \
    "${FIREBASE_URL_HITS}"
else
  pass "no hardcoded Firebase URLs"
fi

# --- Check 7: react-firebase-hooks --------------------------------------------
# Already covered by Check 1's import regex, but we also check for the
# hook names themselves in case someone re-exports them locally.
FIREBASE_HOOK_RE='[^[:alnum:]_](useFirestore|useFirestoreCollection|useFirestoreDoc|useFirebaseAuth|useCollectionData|useDocumentData)[[:space:]]*\('
FIREBASE_HOOK_HITS="$(grep_web "${FIREBASE_HOOK_RE}")"
if [[ -n "${FIREBASE_HOOK_HITS}" ]]; then
  fail "react-firebase-hooks usage detected" \
    "Use trpc.capability.execute.useQuery (with refetchInterval if you need realtime semantics) or Supabase Realtime. No react-firebase-hooks in app code." \
    "${FIREBASE_HOOK_HITS}"
else
  pass "no react-firebase-hooks usage"
fi

# --- summary ------------------------------------------------------------------
echo
if [[ "${FAILURES}" -eq 0 ]]; then
  printf "%s%scheck-no-residue: clean (apps/web/src/ has zero legacy residue)%s\n" \
    "${GREEN}" "${BOLD}" "${NC}"
  exit 0
else
  printf "%s%scheck-no-residue: %d failure(s) — see PORT.md \"The golden no-residue rule\".%s\n" \
    "${RED}" "${BOLD}" "${FAILURES}" "${NC}"
  printf "%sDon't loosen the checks. Fix the offending source files.%s\n" \
    "${YELLOW}" "${NC}"
  exit 1
fi
