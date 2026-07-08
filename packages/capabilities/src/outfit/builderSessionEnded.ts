import { z } from 'zod';
import { logEvent } from '@tela/events';
import { registerCapability } from '../registry.js';
import { getRequestContext } from '../context/requestContext.js';

/**
 * Client-reported builder session summary (spec §7). Sent with keepalive
 * semantics on visibilitychange — mobile-web unload events are lossy, so
 * these counts are CROSS-CHECKED against server-side draft-save deltas
 * before anyone trusts them (the reliability rule).
 */
export const builderSessionEnded = registerCapability({
  name: 'outfit.builderSessionEnded',
  description:
    'Record the end of a builder session: per-slot cycle counts, duration, whether an outfit was saved, and which empty slots prompted an add-items nudge.',
  input: z.object({
    durationMs: z.number().int().min(0),
    cycleCounts: z.record(z.string(), z.number().int().min(0)).default({}),
    saved: z.boolean().default(false),
    addPromptedSlots: z.array(z.string()).default([]),
  }),
  output: z.object({ ok: z.boolean() }),

  async execute({ durationMs, cycleCounts, saved, addPromptedSlots }) {
    const { userId, source } = getRequestContext();

    await logEvent({
      userId,
      type: 'outfit.builder_session_ended',
      source,
      payload: { durationMs, cycleCounts, saved },
    });

    for (const slot of addPromptedSlots) {
      await logEvent({
        userId,
        type: 'wardrobe.add_prompted_from_builder',
        source,
        payload: { slot },
      });
    }

    return { ok: true };
  },
});
