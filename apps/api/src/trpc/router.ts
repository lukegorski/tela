import { initTRPC, TRPCError, type AnyTRPCRouter } from '@trpc/server';
import { z } from 'zod';
import superjson from 'superjson';
import {
  AdminRequiredError,
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
 * Convert capability errors into tRPC errors with the right code.
 * Centralized so both `capability.execute` and the per-domain procedures
 * map known error types consistently.
 */
function rethrowAsTRPCError(err: unknown): never {
  if (err instanceof AdminRequiredError) {
    throw new TRPCError({ code: 'FORBIDDEN', message: err.message, cause: err });
  }
  throw err;
}

/**
 * Convert a registered capability into a tRPC mutation procedure.
 * Capability execution runs inside runInContext() so getRequestContext() works.
 */
function capabilityToProcedure(capability: RegisteredCapability) {
  return authedProcedure
    .input(capability.inputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        return await runInContext(ctx.auth, () => capability.execute(input));
      } catch (err) {
        rethrowAsTRPCError(err);
      }
    });
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
      try {
        return await runInContext(ctx.auth, () => capability.execute(input.input));
      } catch (err) {
        rethrowAsTRPCError(err);
      }
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
