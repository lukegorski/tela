/**
 * Prompt sync script.
 * Reads prompt template files from templates/ directory and syncs them to the database.
 * Each file creates or updates a prompt and creates a new version.
 *
 * Usage: pnpm --filter @tela/prompts prompts:sync
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { getDb, prompts, promptVersions } from '@tela/db';
import { eq } from 'drizzle-orm';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const TEMPLATES_DIR = join(__dirname, '..', 'templates');

interface TemplateFrontmatter {
  name: string;
  description: string;
  variables?: string[];
  model?: string;
}

async function syncPrompts() {
  const db = getDb();
  const files = await readdir(TEMPLATES_DIR);
  const templateFiles = files.filter((f) => f.endsWith('.md') || f.endsWith('.yaml'));

  console.log(`Found ${templateFiles.length} template files`);

  for (const file of templateFiles) {
    const raw = await readFile(join(TEMPLATES_DIR, file), 'utf-8');
    const { data, content } = matter(raw);
    const meta = data as TemplateFrontmatter;

    if (!meta.name) {
      console.warn(`Skipping ${file}: missing 'name' in frontmatter`);
      continue;
    }

    const template = content.trim();
    const variables = meta.variables ?? [];

    // Upsert the prompt record
    let prompt = await db.query.prompts.findFirst({
      where: eq(prompts.name, meta.name),
    });

    if (!prompt) {
      const [created] = await db
        .insert(prompts)
        .values({
          name: meta.name,
          description: meta.description ?? `Prompt: ${meta.name}`,
        })
        .returning();
      prompt = created;
      console.log(`Created prompt: ${meta.name}`);
    }

    // Create a new version
    const [version] = await db
      .insert(promptVersions)
      .values({
        promptId: prompt.id,
        template,
        variables,
        changelog: `Synced from ${basename(file)}`,
      })
      .returning();

    // Update the latest version pointer
    await db
      .update(prompts)
      .set({ latestVersionId: version.id, updatedAt: new Date() })
      .where(eq(prompts.id, prompt.id));

    console.log(`Synced ${meta.name} → version ${version.id}`);
  }

  console.log('Done.');
  process.exit(0);
}

syncPrompts().catch((err) => {
  console.error('Sync failed:', err);
  process.exit(1);
});
