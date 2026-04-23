import type { Context as HonoContext } from 'hono';
import type { RequestContext } from '@tela/capabilities';
import { AuthError, contextFromAuthHeader } from '../auth.js';
import { logger } from '../logger.js';

/**
 * tRPC context created per request.
 * Carries the request ID + (after auth middleware) the resolved RequestContext.
 *
 * Extending Record<string, unknown> satisfies @hono/trpc-server's loose
 * typing for the createContext return shape.
 */
export interface TRPCContext extends Record<string, unknown> {
  requestId: string;
  /** Auth-derived. Null for unauthenticated routes (health, capability.list). */
  auth: RequestContext | null;
  /** The auth error encountered, if any — used to produce clean error responses. */
  authError: AuthError | null;
}

export async function createContext(c: HonoContext): Promise<TRPCContext> {
  const requestId = c.get('requestId') ?? crypto.randomUUID();
  const authHeader = c.req.header('authorization');

  let auth: RequestContext | null = null;
  let authError: AuthError | null = null;

  if (authHeader) {
    try {
      auth = await contextFromAuthHeader(authHeader);
      // Attach the requestId so capabilities + downstream logs can correlate
      auth.requestId = requestId;
    } catch (err) {
      if (err instanceof AuthError) {
        authError = err;
        logger.debug({ requestId, code: err.code, message: err.message }, 'auth failed');
      } else {
        // Unexpected — re-throw so error handler captures
        throw err;
      }
    }
  }

  return { requestId, auth, authError };
}
