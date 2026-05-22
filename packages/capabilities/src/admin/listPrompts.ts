import { z } from 'zod';
import { sql as drizzleSql, asc } from 'drizzle-orm';
import { getDb, prompts, promptVersions } from '@tela/db';
import { registerCapability } from '../registry.js';

const input = z.object({});

const promptSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  latestVersionId: z.string().uuid().nullable(),
  versionCount: z.number().int(),
  latestUpdatedAt: z.string().nullable(),
});

const output = z.object({
  prompts: z.array(promptSchema),
});

/**
 * List all prompts (one row per name) with the count of versions and the
 * timestamp of the latest version. Used for the prompt editor's index page.
 *
 * Admin only. The implementation deliberately doesn't return template text —
 * call admin.getPromptHistory to load the full version log for a single
 * prompt.
 */
export const listPrompts = registerCapability({
  name: 'admin.listPrompts',
  description:
    'List all prompt definitions with their version counts. Admin only. Does not include template text — call admin.getPromptHistory for that.',
  input,
  output,
  requiresAdmin: true,
  chatTool: true,

  async execute() {
    const db = getDb();

    // Single SQL via Drizzle: prompts left-joined to a subquery on
    // promptVersions for count + max(createdAt). Drizzle's group-by helper
    // would be heavy here; keep it explicit with the SQL builder.
    const rows = await db
      .select({
        id: prompts.id,
        name: prompts.name,
        description: prompts.description,
        latestVersionId: prompts.latestVersionId,
        versionCount: drizzleSql<number>`(SELECT count(*)::int FROM ${promptVersions} pv WHERE pv.prompt_id = ${prompts.id})`,
        latestUpdatedAt: drizzleSql<Date | null>`(SELECT max(pv.created_at) FROM ${promptVersions} pv WHERE pv.prompt_id = ${prompts.id})`,
      })
      .from(prompts)
      .orderBy(asc(prompts.name));

    return {
      prompts: rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        latestVersionId: r.latestVersionId,
        versionCount: r.versionCount,
        latestUpdatedAt: r.latestUpdatedAt ? r.latestUpdatedAt.toISOString() : null,
      })),
    };
  },
});
