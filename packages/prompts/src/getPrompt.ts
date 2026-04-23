import { getDb, prompts, promptVersions } from '@tela/db';
import { eq } from 'drizzle-orm';

export interface PromptData {
  name: string;
  template: string;
  variables: string[];
  versionId: string;
}

/**
 * Load a prompt from the database by name.
 * Returns the latest version by default, or a specific version if provided.
 */
export async function getPrompt(
  name: string,
  options?: { versionId?: string },
): Promise<PromptData> {
  const db = getDb();

  // Find the prompt by name
  const prompt = await db.query.prompts.findFirst({
    where: eq(prompts.name, name),
  });

  if (!prompt) {
    throw new Error(`Prompt not found: ${name}`);
  }

  // Load the requested version or latest
  const versionId = options?.versionId ?? prompt.latestVersionId;
  if (!versionId) {
    throw new Error(`Prompt has no versions: ${name}`);
  }

  const version = await db.query.promptVersions.findFirst({
    where: eq(promptVersions.id, versionId),
  });

  if (!version) {
    throw new Error(`Prompt version not found: ${versionId}`);
  }

  return {
    name: prompt.name,
    template: version.template,
    variables: version.variables as string[],
    versionId: version.id,
  };
}
