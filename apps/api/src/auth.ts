/**
 * Auth helpers for the tRPC API.
 *
 * Two token types are supported:
 *
 * 1. **User tokens** — Supabase Auth JWTs from a signed-in user. Validated
 *    against the project's auth API. The token's `sub` is the auth_user_id;
 *    we look up the corresponding row in our `users` table to find the
 *    canonical app userId.
 *
 * 2. **Service-account tokens** — Long-lived tokens used by the MCP server,
 *    workers, scripts, and admin tools. These are static secrets configured
 *    via env. The token specifies which app userId it acts on behalf of.
 *
 * Both produce a `RequestContext` that wraps the capability call.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import type { RequestContext } from '@tela/capabilities';
import { logger } from './logger.js';

let _supabase: SupabaseClient | null = null;
function getSupabaseAdmin(): SupabaseClient {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY required');
  _supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _supabase;
}

let _sql: ReturnType<typeof postgres> | null = null;
function getSql() {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL required');
  // PORT.md pitfall #14: Supabase's transaction-mode pooler (port 6543,
  // host *.pooler.supabase.com) rebinds each query to a different
  // backend connection, so prepared statements set up on one connection
  // aren't visible on the next. Under parallel-request load (e.g., this
  // auth middleware running on every concurrent tRPC call) the result
  // is silent stalls — server never responds, browser HTTP/2 stream
  // stays pending, every subsequent tRPC call queues behind it.
  // The shared @tela/db client got this fix in 189ff81; apps/api's
  // own postgres-js connection here was missed.
  const isPgBouncer = /pooler|:6543/.test(url);
  _sql = postgres(url, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: !isPgBouncer,
  });
  return _sql;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID_TOKEN' | 'NO_USER_RECORD' | 'EXPIRED' | 'MISSING',
  ) {
    super(message);
  }
}

/**
 * Resolve a Supabase Auth JWT to a RequestContext.
 *
 * Two cases:
 *  - Existing user record (auth_user_id matches our users table) → returns context with our userId
 *  - First sign-in (no users row yet) → creates one using auth user's email/phone
 */
async function contextFromUserToken(token: string): Promise<RequestContext> {
  const supabase = getSupabaseAdmin();

  // Validate via Supabase Auth — uses the JWT signature internally
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    throw new AuthError(error?.message ?? 'Invalid token', 'INVALID_TOKEN');
  }

  const authUserId = data.user.id;
  const sql = getSql();

  // Look up our users row; auto-create on first sign-in
  let rows = await sql<{ id: string; is_admin: boolean }[]>`
    SELECT id, is_admin FROM users WHERE auth_user_id = ${authUserId} LIMIT 1
  `;

  if (rows.length === 0) {
    // First sign-in: create the user record
    const email = data.user.email ?? null;
    const phone = data.user.phone ? `+${data.user.phone}` : null;
    const displayName =
      (data.user.user_metadata?.full_name as string | undefined) ??
      (data.user.user_metadata?.name as string | undefined) ??
      null;
    const avatarUrl = (data.user.user_metadata?.avatar_url as string | undefined) ?? null;

    if (!email && !phone) {
      throw new AuthError(
        'Auth user has neither email nor phone — cannot create user record',
        'NO_USER_RECORD',
      );
    }

    const created = await sql<{ id: string; is_admin: boolean }[]>`
      INSERT INTO users (auth_user_id, email, phone, display_name, avatar_url)
      VALUES (${authUserId}, ${email}, ${phone}, ${displayName}, ${avatarUrl})
      RETURNING id, is_admin
    `;
    rows = created;
    logger.info(
      { authUserId, userId: rows[0].id, email, phone },
      'created user record on first sign-in',
    );
  }

  return {
    userId: rows[0].id,
    source: 'web',
    isAdmin: rows[0].is_admin,
  };
}

/**
 * Resolve a service-account token to a RequestContext.
 *
 * Format: `service_<source>:<userId>:<secret>`
 *   e.g. `service_mcp:550e8400-...:<long-random-string>`
 *
 * The secret part must match SERVICE_ACCOUNT_SECRET env var. The userId
 * specifies which app user this call acts on behalf of.
 *
 * This is intentionally simple — long-term we'll likely move to per-user
 * issued tokens with scopes. For now it's a developer convenience.
 */
function contextFromServiceToken(token: string): RequestContext {
  const expectedSecret = process.env.SERVICE_ACCOUNT_SECRET;
  if (!expectedSecret) {
    throw new AuthError('SERVICE_ACCOUNT_SECRET not configured', 'INVALID_TOKEN');
  }

  if (!token.startsWith('service_')) {
    throw new AuthError('Not a service token', 'INVALID_TOKEN');
  }

  // Format: service_<source>:<userId>:<secret>
  const rest = token.slice('service_'.length);
  const parts = rest.split(':');
  if (parts.length !== 3) {
    throw new AuthError('Malformed service token', 'INVALID_TOKEN');
  }
  const [source, userId, secret] = parts;

  if (secret !== expectedSecret) {
    throw new AuthError('Invalid service token secret', 'INVALID_TOKEN');
  }

  const validSources = new Set(['mcp', 'worker', 'admin', 'test']);
  if (!validSources.has(source)) {
    throw new AuthError(
      `Invalid service source "${source}" — must be one of: mcp, worker, admin, test`,
      'INVALID_TOKEN',
    );
  }

  return {
    userId,
    source: source as RequestContext['source'],
    isServiceAccount: true,
    // Service-account contexts are trusted at the auth layer (the secret is
    // only held by Luke's machines + the deployed services), so they bypass
    // the admin gate. Admin-only capabilities can still be invoked from MCP /
    // workers / scripts when needed.
    isAdmin: true,
  };
}

/**
 * Parse the Authorization header and produce a RequestContext.
 * Throws AuthError on any failure.
 */
export async function contextFromAuthHeader(
  authHeader: string | undefined,
): Promise<RequestContext> {
  if (!authHeader) {
    throw new AuthError('Missing Authorization header', 'MISSING');
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new AuthError('Authorization header must be "Bearer <token>"', 'INVALID_TOKEN');
  }

  const token = match[1].trim();

  if (token.startsWith('service_')) {
    return contextFromServiceToken(token);
  }

  return contextFromUserToken(token);
}
