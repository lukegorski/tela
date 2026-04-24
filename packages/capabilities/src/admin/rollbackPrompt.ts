import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { getDb, prompts, promptVersions } from '@tela/db';
import { registerCapability } from '../registry.js';

const input = z.object({
  /** Prompt name, e.g. 'chat.system'. */
  name: z.string().min(1),
  /** The version to make live. Must belong to the same prompt. */
  versionId: z.string().uuid(),
});

const output = z.object({
  promptId: z.string().uuid(),
  versionId: z.string().uuid(),
});

/**
 * Point a prompt's latest_version_id at any past version. Used to roll back
 * a regression or to promote a draft version. The version must belong to
 * the same prompt — we validate before flipping the pointer.
 *
 * Admin only.
 */
export const rollbackPrompt = registerCapability({
  name: 'admin.rollbackPrompt',
  description:
    "Set a prompt's live version to a specific past versionId. Used for rollback after a regression or to promote a draft. Admin only.",
  input,
  output,
  requiresAdmin: true,

  async execute({ name, versionId }) {
    const db = getDb();

    const prompt = await db.query.prompts.findFirst({
      where: eq(prompts.name, name),
    });
    if (!prompt) {
      throw new Error(`Prompt not found: ${name}`);
    }

    // Make sure the target version belongs to this prompt — otherwise we'd
    // happily flip a chat.system prompt to point at an item.analyze version,
    // which would silently break the next call.
    const version = await db.query.promptVersions.findFirst({
      where: and(eq(promptVersions.id, versionId), eq(promptVersions.promptId, prompt.id)),
    });
    if (!version) {
      throw new Error(
        `Version ${versionId} does not belong to prompt ${name}. Refusing to flip pointer.`,
      );
    }

    await db
      .update(prompts)
      .set({ latestVersionId: versionId, updatedAt: new Date() })
      .where(eq(prompts.id, prompt.id));

    return { promptId: prompt.id, versionId };
  },
});
