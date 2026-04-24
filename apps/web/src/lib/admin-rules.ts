/**
 * Server-side stylist_rules queries for the admin editor. Mirrors
 * admin.list/get capabilities but reads directly from Postgres so /admin
 * RSC pages don't have to round-trip through tRPC + auth.
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

export interface StylistRule {
  id: string;
  category: string;
  rule: string;
  priority: number;
  active: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export async function listAllRules(): Promise<StylistRule[]> {
  const sql = getSql();
  const rows = await sql<
    {
      id: string;
      category: string;
      rule: string;
      priority: number;
      active: boolean;
      version: number;
      created_at: Date;
      updated_at: Date;
    }[]
  >`
    SELECT id, category, rule, priority, active, version, created_at, updated_at
    FROM stylist_rules
    ORDER BY active DESC, priority DESC, updated_at DESC, category ASC
  `;
  return rows.map((r) => ({
    id: r.id,
    category: r.category,
    rule: r.rule,
    priority: r.priority,
    active: r.active,
    version: r.version,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  }));
}

export async function getRule(id: string): Promise<StylistRule | null> {
  const sql = getSql();
  const rows = await sql<
    {
      id: string;
      category: string;
      rule: string;
      priority: number;
      active: boolean;
      version: number;
      created_at: Date;
      updated_at: Date;
    }[]
  >`
    SELECT id, category, rule, priority, active, version, created_at, updated_at
    FROM stylist_rules
    WHERE id = ${id}
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    category: r.category,
    rule: r.rule,
    priority: r.priority,
    active: r.active,
    version: r.version,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

/**
 * Bucket rules by category for display. Categories are free-form text;
 * the editor surfaces them as section headers.
 */
export function groupByCategory(rules: StylistRule[]): Record<string, StylistRule[]> {
  const groups: Record<string, StylistRule[]> = {};
  for (const rule of rules) {
    (groups[rule.category] ??= []).push(rule);
  }
  return groups;
}
