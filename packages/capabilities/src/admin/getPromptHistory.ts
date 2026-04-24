import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { getDb, prompts, promptVersions } from '@tela/db';
import { registerCapability } from '../registry.js';

const input = z.object({
  /** Prompt name, e.g. 'chat.system' or 'item.analyze'. */
  name: z.string().min(1),
});

const versionSchema = z.object({
  id: z.string().uuid(),
  template: z.string(),
  variables: z.array(z.string()),
  changelog: z.string().nullable(),
  createdAt: z.string(),
  isLatest: z.boolean(),
});

const output = z.object({
  prompt: z.object({
    id: z.string().uuid(),
    name: z.string(),
    description: z.string(),
    latestVersionId: z.string().uuid().nullable(),
  }),
  versions: z.array(versionSchema),
});

/**
 * Get the full version history of a single prompt, newest first. The version
 * marked `isLatest: true` is the one currently served by getPrompt() at
 * runtime. Admin only.
 */
export const getPromptHistory = registerCapability({
  name: 'admin.getPromptHistory',
  description:
    'Get a single prompt with its full version history (newest first). The latest pointer is exposed so the editor knows which version is currently live. Admin only.',
  input,
  output,
  requiresAdmin: true,

  async execute({ name }) {
    const db = getDb();

    const prompt = await db.query.prompts.findFirst({
      where: eq(prompts.name, name),
    });
    if (!prompt) {
      throw new Error(`Prompt not found: ${name}`);
    }

    const versions = await db
      .select()
      .from(promptVersions)
      .where(eq(promptVersions.promptId, prompt.id))
      .orderBy(desc(promptVersions.createdAt));

    return {
      prompt: {
        id: prompt.id,
        name: prompt.name,
        description: prompt.description,
        latestVersionId: prompt.latestVersionId,
      },
      versions: versions.map((v) => ({
        id: v.id,
        template: v.template,
        variables: v.variables as string[],
        changelog: v.changelog,
        createdAt: v.createdAt.toISOString(),
        isLatest: v.id === prompt.latestVersionId,
      })),
    };
  },
});
