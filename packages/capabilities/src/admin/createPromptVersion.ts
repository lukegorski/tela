import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb, prompts, promptVersions } from '@tela/db';
import { registerCapability } from '../registry.js';

const input = z.object({
  /** Prompt name, e.g. 'chat.system'. Must already exist (created via the file-template sync script). */
  name: z.string().min(1),
  template: z.string().min(1).max(50000),
  /** Variables the template expects, e.g. ['profile_text', 'wardrobe_summary']. */
  variables: z.array(z.string()).default([]),
  /** Short note for the version log. */
  changelog: z.string().max(2000).optional(),
  /**
   * If true (the default), this new version becomes the live one — getPrompt()
   * will return it on the next call. Pass false to create a draft version
   * that requires a separate admin.rollbackPrompt to promote.
   */
  promote: z.boolean().default(true),
});

const output = z.object({
  versionId: z.string().uuid(),
  promoted: z.boolean(),
});

/**
 * Create a new version of an existing prompt. By default it's promoted to
 * live immediately (latest_version_id pointer flipped). Pass promote=false
 * to create a draft.
 *
 * The capability does NOT auto-create a new prompt name — that comes from the
 * file-template sync flow. This is for editing existing prompts in place.
 *
 * Admin only.
 */
export const createPromptVersion = registerCapability({
  name: 'admin.createPromptVersion',
  description:
    "Create a new version of an existing prompt. By default it becomes the live version. Pass promote=false to create a draft. Admin only.",
  input,
  output,
  requiresAdmin: true,

  async execute({ name, template, variables, changelog, promote }) {
    const db = getDb();

    const prompt = await db.query.prompts.findFirst({
      where: eq(prompts.name, name),
    });
    if (!prompt) {
      throw new Error(
        `Prompt not found: ${name}. Add it via the file-template sync first; this capability only creates new versions of existing prompts.`,
      );
    }

    const [version] = await db
      .insert(promptVersions)
      .values({
        promptId: prompt.id,
        template,
        variables,
        changelog: changelog ?? null,
      })
      .returning({ id: promptVersions.id });

    if (promote) {
      await db
        .update(prompts)
        .set({ latestVersionId: version.id, updatedAt: new Date() })
        .where(eq(prompts.id, prompt.id));
    }

    return { versionId: version.id, promoted: promote };
  },
});
