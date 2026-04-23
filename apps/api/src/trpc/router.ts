import { initTRPC, type AnyTRPCRouter } from '@trpc/server';
import { z } from 'zod';
import { getAllCapabilities, type RegisteredCapability } from '@tela/capabilities';
import type { TRPCContext } from './context.js';

const t = initTRPC.context<TRPCContext>().create();

const publicProcedure = t.procedure;

/**
 * Convert a registered capability into a tRPC mutation procedure.
 * The capability's input/output schemas are reused directly — no duplication.
 */
function capabilityToProcedure(capability: RegisteredCapability) {
  return publicProcedure
    .input(capability.inputSchema)
    .mutation(async ({ input }) => capability.execute(input));
}

/**
 * Group capabilities by domain (the part before the first `.` in the name)
 * and build a tRPC router per domain.
 *
 * E.g. wardrobe.addItem, wardrobe.getItem → router.wardrobe.{addItem, getItem}
 */
function buildDomainRouters(capabilities: RegisteredCapability[]): Record<string, AnyTRPCRouter> {
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

// Generic dispatch + discovery endpoints
const capabilityRouter = t.router({
  execute: publicProcedure
    .input(z.object({ name: z.string(), input: z.unknown() }))
    .mutation(async ({ input }) => {
      const capability = getAllCapabilities().find((c) => c.name === input.name);
      if (!capability) throw new Error(`Unknown capability: ${input.name}`);
      return capability.execute(input.input);
    }),

  list: publicProcedure.query(() =>
    getAllCapabilities().map((c) => ({ name: c.name, description: c.description })),
  ),
});

// Build domain routers from the capability registry at module load
const domainRouters = buildDomainRouters(getAllCapabilities());

export const appRouter = t.router({
  capability: capabilityRouter,
  ...domainRouters,
});

export type AppRouter = typeof appRouter;
