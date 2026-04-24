/**
 * Server-side queries for the admin prompt editor. Mirrors
 * admin.listPrompts / admin.getPromptHistory; reads directly from Postgres
 * for /admin RSC pages.
 */
import 'server-only';
import postgres from 'postgres';

let _sql: ReturnType<typeof postgres> | null = null;
function getSql() {
  if (_sql) return _sql;
  _sql = postgres(process.env.DATABASE_URL!, {
    max: 3,
    idle_timeout: 10,
    connect_timeout: 10,
  });
  return _sql;
}

export interface PromptSummary {
  id: string;
  name: string;
  description: string;
  latestVersionId: string | null;
  versionCount: number;
  latestUpdatedAt: string | null;
}

export interface PromptVersion {
  id: string;
  template: string;
  variables: string[];
  changelog: string | null;
  createdAt: string;
  isLatest: boolean;
}

export interface PromptDetail {
  id: string;
  name: string;
  description: string;
  latestVersionId: string | null;
  versions: PromptVersion[];
}

export async function listPrompts(): Promise<PromptSummary[]> {
  const sql = getSql();
  const rows = await sql<
    {
      id: string;
      name: string;
      description: string;
      latest_version_id: string | null;
      version_count: number;
      latest_updated_at: Date | null;
    }[]
  >`
    SELECT
      p.id,
      p.name,
      p.description,
      p.latest_version_id,
      (SELECT count(*)::int FROM prompt_versions pv WHERE pv.prompt_id = p.id) AS version_count,
      (SELECT max(pv.created_at)  FROM prompt_versions pv WHERE pv.prompt_id = p.id) AS latest_updated_at
    FROM prompts p
    ORDER BY p.name ASC
  `;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    latestVersionId: r.latest_version_id,
    versionCount: r.version_count,
    latestUpdatedAt: r.latest_updated_at ? r.latest_updated_at.toISOString() : null,
  }));
}

export async function getPromptDetail(name: string): Promise<PromptDetail | null> {
  const sql = getSql();
  const promptRows = await sql<
    {
      id: string;
      name: string;
      description: string;
      latest_version_id: string | null;
    }[]
  >`
    SELECT id, name, description, latest_version_id
    FROM prompts
    WHERE name = ${name}
    LIMIT 1
  `;
  if (promptRows.length === 0) return null;
  const p = promptRows[0];

  const versions = await sql<
    {
      id: string;
      template: string;
      variables: string[];
      changelog: string | null;
      created_at: Date;
    }[]
  >`
    SELECT id, template, variables, changelog, created_at
    FROM prompt_versions
    WHERE prompt_id = ${p.id}
    ORDER BY created_at DESC
  `;

  return {
    id: p.id,
    name: p.name,
    description: p.description,
    latestVersionId: p.latest_version_id,
    versions: versions.map((v) => ({
      id: v.id,
      template: v.template,
      variables: (v.variables as string[]) ?? [],
      changelog: v.changelog,
      createdAt: v.created_at.toISOString(),
      isLatest: v.id === p.latest_version_id,
    })),
  };
}
