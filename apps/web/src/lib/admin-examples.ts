/**
 * Server-side annotated_examples queries for the admin editor.
 * Mirrors admin.listExamples / lookup capabilities; reads directly from
 * Postgres so the /admin RSC pages don't round-trip through tRPC.
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

export interface AnnotatedExample {
  id: string;
  title: string;
  outfitDescription: string;
  reasoning: string;
  context: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export async function listAllExamples(): Promise<AnnotatedExample[]> {
  const sql = getSql();
  const rows = await sql<
    {
      id: string;
      title: string;
      outfit_description: string;
      reasoning: string;
      context: string;
      tags: string[];
      created_at: Date;
      updated_at: Date;
    }[]
  >`
    SELECT id, title, outfit_description, reasoning, context, tags, created_at, updated_at
    FROM annotated_examples
    ORDER BY updated_at DESC
  `;
  return rows.map(rowToExample);
}

export async function getExample(id: string): Promise<AnnotatedExample | null> {
  const sql = getSql();
  const rows = await sql<
    {
      id: string;
      title: string;
      outfit_description: string;
      reasoning: string;
      context: string;
      tags: string[];
      created_at: Date;
      updated_at: Date;
    }[]
  >`
    SELECT id, title, outfit_description, reasoning, context, tags, created_at, updated_at
    FROM annotated_examples
    WHERE id = ${id}
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  return rowToExample(rows[0]);
}

function rowToExample(r: {
  id: string;
  title: string;
  outfit_description: string;
  reasoning: string;
  context: string;
  tags: string[];
  created_at: Date;
  updated_at: Date;
}): AnnotatedExample {
  return {
    id: r.id,
    title: r.title,
    outfitDescription: r.outfit_description,
    reasoning: r.reasoning,
    context: r.context,
    tags: r.tags ?? [],
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}
