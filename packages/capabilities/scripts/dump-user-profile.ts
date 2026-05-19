#!/usr/bin/env tsx
/**
 * Dump a user's full profile fields (jsonb columns expanded) for diagnosis.
 * Use during migration verification when auth.whoami is 500ing — the most
 * common cause is jsonb data shape (location/tryOnSettings/preferences)
 * not matching the zod output schema.
 */
import { sql } from 'drizzle-orm';
import { getDb } from '@tela/db';

const i = process.argv.indexOf('--email');
if (i === -1 || !process.argv[i + 1]) {
  console.error('Usage: dump-user-profile.ts --email <email>');
  process.exit(2);
}
const email = process.argv[i + 1].trim().toLowerCase();

const db = getDb();
const rows = await db.execute(sql`
  SELECT id, email, phone, display_name, avatar_url, locale, is_admin,
         onboarding_complete, preferences, body_info, location, try_on_settings,
         created_at, updated_at
  FROM users WHERE lower(email) = ${email}
`);
if (rows.length === 0) {
  console.log('no user');
  process.exit(0);
}
const r = rows[0];
for (const [k, v] of Object.entries(r)) {
  const s = v === null ? 'null' : typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v);
  console.log(`${k}:`);
  console.log(`  ${s.split('\n').join('\n  ')}`);
}
process.exit(0);
