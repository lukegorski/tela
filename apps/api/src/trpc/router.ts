import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import { getAllCapabilities } from '@tela/capabilities';
import type { TRPCContext } from './context.js';

const t = initTRPC.context<TRPCContext>().create();

const publicProcedure = t.procedure;

/**
 * Build the tRPC router from registered capabilities.
 *
 * Each capability becomes a mutation endpoint:
 *   trpc.capability.execute({ name: 'wardrobe.addItem', input: {...} })
 *
 * Individual typed endpoints are also created for each registered capability
 * for clients that want direct access with full type safety.
 */

// Generic capability executor — accepts any capability by name
const capabilityRouter = t.router({
  execute: publicProcedure
    .input(
      z.object({
        name: z.string(),
        input: z.unknown(),
      }),
    )
    .mutation(async ({ input }) => {
      const capabilities = getAllCapabilities();
      const capability = capabilities.find((c) => c.name === input.name);

      if (!capability) {
        throw new Error(`Unknown capability: ${input.name}`);
      }

      const result = await capability.execute(input.input);
      return result;
    }),

  // List all available capabilities (useful for MCP server and discovery)
  list: publicProcedure.query(() => {
    return getAllCapabilities().map((c) => ({
      name: c.name,
      description: c.description,
    }));
  }),
});

// Wardrobe-specific typed endpoints
const wardrobeRouter = t.router({
  addItem: publicProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        photoId: z.string().uuid(),
        metadata: z.object({
          category: z.string().min(1),
          subcategory: z.string().nullable().default(null),
          primaryColor: z.string().min(1),
          secondaryColor: z.string().nullable().default(null),
          pattern: z.string().nullable().default(null),
          style: z.string().nullable().default(null),
          fit: z.string().nullable().default(null),
          length: z.string().nullable().default(null),
          sleeveLength: z.string().nullable().default(null),
          description: z.string().nullable().default(null),
          formalityScore: z.number().min(0).max(1).default(0.5),
          materialWeight: z.enum(['light', 'medium', 'heavy']).default('medium'),
          seasonCompatibility: z
            .array(z.enum(['spring', 'summer', 'fall', 'winter']))
            .default([]),
          analysisLocale: z.string().default('en'),
        }),
      }),
    )
    .mutation(async ({ input }) => {
      const { executeCapability } = await import('@tela/capabilities');
      return executeCapability('wardrobe.addItem', input);
    }),
});

// Root router
export const appRouter = t.router({
  capability: capabilityRouter,
  wardrobe: wardrobeRouter,
});

export type AppRouter = typeof appRouter;
