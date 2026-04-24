import { initTRPC, TRPCError, type AnyTRPCRouter } from '@trpc/server';
import { z } from 'zod';
import superjson from 'superjson';
import {
  getAllCapabilities,
  runInContext,
  type RegisteredCapability,
} from '@tela/capabilities';
import type { TRPCContext } from './context.js';

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

/**
 * Public procedure — no auth required. Use sparingly.
 */
const publicProcedure = t.procedure;

/**
 * Authed procedure — requires a valid Authorization header. Capability calls
 * run inside the request context, so capabilities can read userId via
 * getRequestContext().
 */
const authedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (ctx.authError) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: ctx.authError.message });
  }
  if (!ctx.auth) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required. Pass Authorization: Bearer <token>',
    });
  }
  return next({ ctx: { ...ctx, auth: ctx.auth } });
});

/**
 * Convert a registered capability into a tRPC mutation procedure.
 * Capability execution runs inside runInContext() so getRequestContext() works.
 */
function capabilityToProcedure(capability: RegisteredCapability) {
  return authedProcedure
    .input(capability.inputSchema)
    .mutation(async ({ input, ctx }) => runInContext(ctx.auth, () => capability.execute(input)));
}

/**
 * Group capabilities by domain → build a tRPC router per domain.
 */
function buildDomainRouters(
  capabilities: RegisteredCapability[],
): Record<string, AnyTRPCRouter> {
  const grouped: Record<string, Record<string, ReturnType<typeof capabilityToProcedure>>> = {};
  for (const cap of capabilities) {
    const [domain, action] = cap.name.split('.');
    if (!domain || !action) continue;
    grouped[domain] ??= {};
    grouped[domain][action] = capabilityToProcedure(cap);
  }
  const routers: Record<string, AnyTRPCRouter> = {};
  for (const [domain, procedures] of Object.entries(grouped)) {
    routers[domain] = t.router(procedures);
  }
  return routers;
}

const capabilityRouter = t.router({
  // Generic capability executor — also requires auth
  execute: authedProcedure
    .input(z.object({ name: z.string(), input: z.unknown() }))
    .mutation(async ({ input, ctx }) => {
      const capability = getAllCapabilities().find((c) => c.name === input.name);
      if (!capability) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `Unknown capability: ${input.name}` });
      }
      return runInContext(ctx.auth, () => capability.execute(input.input));
    }),

  // Public discovery endpoint — no auth needed
  list: publicProcedure.query(() =>
    getAllCapabilities().map((c) => ({ name: c.name, description: c.description })),
  ),
});

const domainRouters = buildDomainRouters(getAllCapabilities());

export const appRouter = t.router({
  capability: capabilityRouter,
  ...domainRouters,
});

export type AppRouter = typeof appRouter;
