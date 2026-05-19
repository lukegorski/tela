#!/usr/bin/env tsx
/**
 * Generate a one-time magic link for a user via Supabase Admin API. Used
 * during Phase 11 multi-user migration verification (M8): the operator
 * opens the printed URL in incognito to sign in as the target user and
 * spot-check their migrated data.
 *
 * IMPORTANT: the redirect target must be the app's `/auth/callback` route
 * (which exchanges the PKCE code for a session and sets the auth cookie).
 * Pointing redirectTo directly at a page like `/en/wardrobe` skips the
 * exchange, so the app's tRPC client gets no auth token → 401 on every
 * data call. This script defaults to `${site}/auth/callback?next=${next}`
 * which is the canonical pattern used by useAuth.ts.
 *
 * Usage:
 *   ~/bin/doppler run --project tela --config dev -- \
 *     pnpm --filter @tela/capabilities exec tsx \
 *     scripts/generate-magic-link.ts --email <email> [--next <path>] [--site <url>]
 *
 *   --next   App path to land on after the auth exchange. Default: '/en/wardrobe'.
 *   --site   Base app URL. Default: 'http://localhost:3000'.
 *   --raw-redirect <url>   Escape hatch — pass redirectTo verbatim, skip the
 *                          /auth/callback wrapping. Use only if you know what
 *                          you're doing (e.g. testing a non-PKCE flow).
 */
import { getSupabaseAdmin } from '../src/storage/supabase.js';

const args = process.argv.slice(2);
function getFlag(name: string): string | undefined {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
}

const email = getFlag('--email')?.trim().toLowerCase();
const next = getFlag('--next') ?? '/en/wardrobe';
const site = (getFlag('--site') ?? 'http://localhost:3000').replace(/\/$/, '');
const rawRedirect = getFlag('--raw-redirect');

if (!email) {
  console.error('Usage: generate-magic-link.ts --email <email> [--next <path>] [--site <url>] [--raw-redirect <url>]');
  process.exit(2);
}

// IMPORTANT: admin.generateLink uses Supabase's implicit auth flow (tokens
// in URL fragment), not PKCE. Our /auth/callback route only handles PKCE
// (?code=). Magic-link verification needs to route through a fragment-aware
// handler. /auth/magic-callback exists for exactly this.
const redirectTo = rawRedirect ?? `${site}/auth/magic-callback?next=${encodeURIComponent(next)}`;

const supabase = getSupabaseAdmin();
const { data, error } = await supabase.auth.admin.generateLink({
  type: 'magiclink',
  email,
  options: { redirectTo },
});

if (error || !data) {
  console.error(`generateLink failed: ${error?.message ?? 'no data returned'}`);
  process.exit(1);
}

const actionLink = (data.properties as { action_link?: string } | null)?.action_link;
if (!actionLink) {
  console.error('No action_link in response');
  console.error(JSON.stringify(data, null, 2));
  process.exit(1);
}

console.log(`\nMagic link for ${email} (single use, expires per Supabase Auth defaults):\n`);
console.log(actionLink);
console.log(`\nOpen in an INCOGNITO window so it doesn't collide with any existing session.`);
if (redirectTo) {
  console.log(`After sign-in you'll be redirected to: ${redirectTo}`);
}
process.exit(0);
