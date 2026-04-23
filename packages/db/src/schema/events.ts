import { pgTable, uuid, varchar, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
    type: varchar('type', { length: 100 }).notNull(),
    source: varchar('source', { length: 20 }).notNull(),
    contextSnapshot: jsonb('context_snapshot'),
    payload: jsonb('payload'),
  },
  (table) => [
    index('events_user_id_idx').on(table.userId),
    index('events_timestamp_idx').on(table.timestamp),
    index('events_type_idx').on(table.type),
    index('events_user_type_idx').on(table.userId, table.type),
  ],
);
