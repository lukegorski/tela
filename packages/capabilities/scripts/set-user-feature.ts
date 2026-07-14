/**
 * Flip a per-user feature flag (users.features jsonb) — the beta stand-in
 * for the v1 admin toggle. Only the entitlements choke point reads these.
 *
 * Usage:
 *   doppler run --project tela --config dev -- \
 *     pnpm --filter @tela/capabilities exec tsx scripts/set-user-feature.ts \
 *       --email luke@lukegorski.com --key builder --value true [--apply]
 *
 * Values: true | false | null (null deletes the key). Dry run by default.
 */
import { eq, sql } from 'drizzle-orm';
import { getDb, users } from '@tela/db';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const email = arg('email');
const key = arg('key');
const raw = arg('value');
const APPLY = process.argv.includes('--apply');

if (!email || !key || raw === undefined) {
  console.error('required: --email <email> --key <feature> --value <true|false|null>');
  process.exit(1);
}
if (!['true', 'false', 'null'].includes(raw)) {
  console.error(`--value must be true|false|null, got: ${raw}`);
  process.exit(1);
}
if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(key)) {
  console.error(`--key must be a simple identifier, got: ${key}`);
  process.exit(1);
}

const db = getDb();
const user = await db.query.users.findFirst({
  where: eq(users.email, email),
  columns: { id: true, email: true, features: true },
});
if (!user) {
  console.error(`no user with email ${email}`);
  process.exit(1);
}

const before = (user.features ?? {}) as Record<string, unknown>;
const after = { ...before };
if (raw === 'null') delete after[key];
else after[key] = raw === 'true';

console.log(`user ${user.id} <${user.email}>`);
console.log('features before:', JSON.stringify(before));
console.log('features after: ', JSON.stringify(after));

if (!APPLY) {
  console.log('(dry run — pass --apply to write)');
  process.exit(0);
}

await db
  .update(users)
  .set({ features: after, updatedAt: new Date() })
  .where(eq(users.id, user.id));
console.log('applied.');
process.exit(0);
