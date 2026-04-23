import { pgTable, uuid, varchar, timestamp, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Auth identity (one of email/phone is required, enforced by CHECK constraint below)
    email: varchar('email', { length: 255 }).unique(),
    phone: varchar('phone', { length: 32 }).unique(),
    // Link to Supabase Auth's auth.users table — null if user was created
    // pre-auth (only Luke + cofounder + e2e tests, all of whom will be re-linked
    // when they sign in for the first time)
    authUserId: uuid('auth_user_id').unique(),
    // Profile fields
    displayName: varchar('display_name', { length: 255 }),
    avatarUrl: varchar('avatar_url', { length: 1024 }),
    locale: varchar('locale', { length: 10 }).notNull().default('en'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'users_email_or_phone_required',
      sql`${table.email} IS NOT NULL OR ${table.phone} IS NOT NULL`,
    ),
  ],
);
