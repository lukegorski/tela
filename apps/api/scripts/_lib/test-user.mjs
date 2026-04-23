/**
 * Shared helpers for e2e test scripts: create a real Supabase Auth user,
 * get a JWT, and produce an Authorization header.
 *
 * Used by the e2e-test-*.mjs scripts. Tears the user down on cleanup().
 */
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const supabasePublic = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_PUBLISHABLE_KEY,
);

const API_BASE = process.env.API_BASE ?? 'http://localhost:3001';

/**
 * Hit a tRPC endpoint with the given auth token.
 * Throws on non-OK responses.
 */
export async function trpcCall(procedure, input, authHeader) {
  // All capability endpoints are mutations (POST). Only capability.list is a query.
  const isQuery = procedure === 'capability.list';
  const url = isQuery
    ? `${API_BASE}/trpc/${procedure}?input=${encodeURIComponent(JSON.stringify(input ?? {}))}`
    : `${API_BASE}/trpc/${procedure}`;

  const res = await fetch(url, {
    method: isQuery ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
    body: isQuery ? undefined : JSON.stringify(input ?? {}),
  });
  const data = await res.json();
  if (data.error) {
    throw new Error(`${procedure}: ${data.error.message ?? JSON.stringify(data.error)}`);
  }
  return data.result.data;
}

export async function createTestUser({ prefix = 'e2e' } = {}) {
  const email = `${prefix}-${Date.now()}@tela.test`;
  const password = `Test_${crypto.randomUUID()}`;

  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'E2E Test User' },
  });
  if (createErr) throw new Error(`createUser failed: ${createErr.message}`);

  const { data: session, error: signInErr } = await supabasePublic.auth.signInWithPassword({
    email,
    password,
  });
  if (signInErr) throw new Error(`signIn failed: ${signInErr.message}`);

  const authHeader = `Bearer ${session.session.access_token}`;

  // First call also bootstraps the users row in our DB
  const me = await trpcCall('auth.whoami', {}, authHeader);

  return {
    authUserId: created.user.id,
    appUserId: me.userId,
    email,
    accessToken: session.session.access_token,
    authHeader,
  };
}

export async function teardownTestUser({ authUserId }) {
  try {
    await supabaseAdmin.auth.admin.deleteUser(authUserId);
  } catch (err) {
    console.warn('teardownTestUser failed:', err.message);
  }
}
