import type { Context as HonoContext } from 'hono';

/**
 * tRPC context created per request.
 * Will include auth info once Supabase Auth is integrated.
 */
export interface TRPCContext extends Record<string, unknown> {
  requestId: string;
  // userId will be added once auth is integrated:
  // userId: string | null;
}

export function createContext(c: HonoContext): TRPCContext {
  return {
    requestId: c.get('requestId') ?? crypto.randomUUID(),
  };
}
