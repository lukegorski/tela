/**
 * Server-side stylist_rules queries for the admin editor. Mirrors
 * admin.list/get capabilities but reads directly from Postgres so /admin
 * RSC pages don't have to round-trip through tRPC + auth.
 */
import 'server-only';
import { getSql } from '@tela/db';

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
    createdAt: new Date(r.created_at as string | Date).toISOString(),
    updatedAt: new Date(r.updated_at as string | Date).toISOString(),
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
    createdAt: new Date(r.created_at as string | Date).toISOString(),
    updatedAt: new Date(r.updated_at as string | Date).toISOString(),
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
