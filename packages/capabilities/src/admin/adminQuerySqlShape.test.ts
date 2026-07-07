import { describe, it, expect } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { buildUserConversationsQuery } from './getUserConversations.js';
import { buildAdminChatsQuery } from './listAdminChats.js';

/**
 * Regression tests for the Drizzle bare-column-interpolation bug class
 * (admin.listUsers commit f729b5e; admin.getUserConversations Sentry
 * TELA-API-P).
 *
 * `${table.column}` inside a `sql` template that lives inside a SELECT
 * projection emits the bare column name (`"id"`) when the select has no
 * joins. A correlated subquery whose FROM mentions tables with their own
 * `id` then fails with `column reference "id" is ambiguous` (42702) — or
 * silently resolves to the wrong table. These tests pin the generated
 * SQL without touching a database (drizzle.mock() never connects).
 */
const db = drizzle.mock() as unknown as Parameters<typeof buildUserConversationsQuery>[0];
const USER_ID = '00000000-0000-0000-0000-000000000000';

describe('admin query SQL shape', () => {
  it('getUserConversations cost subquery keeps the outer conversation ref qualified', () => {
    const { sql } = buildUserConversationsQuery(db, USER_ID).toSQL();
    expect(sql).toContain('m.conversation_id = chat_conversations.id');
    expect(sql).not.toMatch(/=\s*"id"/);
  });

  it('listAdminChats cost subquery keeps the outer conversation ref qualified', () => {
    const { sql } = buildAdminChatsQuery(db, 51, 0).toSQL();
    expect(sql).toContain('m.conversation_id = chat_conversations.id');
    expect(sql).not.toMatch(/=\s*"id"/);
  });
});
