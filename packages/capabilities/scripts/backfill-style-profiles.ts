#!/usr/bin/env tsx
/**
 * Backfill style_profiles for users who lack one. The Phase 11 migration
 * intentionally skips style_profile creation — the migration script's
 * UX promise ("regenerates on first generate") was unwired, so migrated
 * users would hit outfit.generate's missing-profile throw on their first
 * `+` tap. apps/web's outfit.generate now lazy-inits via closetRead, but
 * that adds ~30s to the first Generate. This script pre-warms by running
 * closetRead ahead of time so verification + first-day cutover UX is
 * instant.
 *
 * Idempotent: skips users who already have profiles.
 *
 * Usage:
 *   ~/bin/doppler run --project tela --config dev -- \
 *     pnpm --filter @tela/capabilities exec tsx \
 *     scripts/backfill-style-profiles.ts --email <email> [--email <email2> ...]
 *
 *   --all        Process every user without a style_profile (use with care).
 *   --dry-run    Print who would be processed, no AI calls.
 *
 * Cost: ~$0.10-0.30 per user (closetRead is one AI call).
 * Time: ~30s per user (AI latency, sequential).
 */
import { sql } from 'drizzle-orm';
import { getDb, closeDb } from '@tela/db';
import { runInContext, executeCapability } from '@tela/capabilities';

interface Args {
  emails: string[];
  isAll: boolean;
  isDryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { emails: [], isAll: false, isDryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') out.isAll = true;
    else if (a === '--dry-run') out.isDryRun = true;
    else if (a === '--email' && argv[i + 1]) {
      out.emails.push(argv[++i].trim().toLowerCase());
    } else if (a === '-h' || a === '--help') {
      console.log(
        'Usage: --email <email> [--email <email>...] OR --all  [--dry-run]',
      );
      process.exit(0);
    } else {
      console.error(`Unknown arg: ${a}`);
      process.exit(2);
    }
  }
  if (!out.isAll && out.emails.length === 0) {
    console.error('Provide --email <email> or --all');
    process.exit(2);
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const db = getDb();

  // Find users missing a style_profile. Resolve emails individually
  // (one query per address) — drizzle's sql tag doesn't bind JS arrays
  // cleanly to Postgres ANY/IN, and per-row lookup is fast enough at
  // this scale.
  type TargetRow = { id: string; email: string };
  let targets: TargetRow[];
  if (args.isAll) {
    targets = (await db.execute<TargetRow>(sql`
      SELECT u.id, u.email
      FROM users u
      LEFT JOIN style_profiles sp ON sp.user_id = u.id
      WHERE sp.id IS NULL AND u.email IS NOT NULL
      ORDER BY u.email
    `)) as unknown as TargetRow[];
  } else {
    const found: TargetRow[] = [];
    for (const e of args.emails) {
      const rows = (await db.execute<TargetRow>(sql`
        SELECT u.id, u.email
        FROM users u
        LEFT JOIN style_profiles sp ON sp.user_id = u.id
        WHERE sp.id IS NULL AND lower(u.email) = ${e}
        LIMIT 1
      `)) as unknown as TargetRow[];
      if (rows.length > 0) found.push(rows[0]);
      else console.warn(`  (skip) ${e}: not found OR already has a style_profile`);
    }
    targets = found;
  }

  if (targets.length === 0) {
    console.log('No matching users without a style_profile. Nothing to do.');
    await closeDb();
    return;
  }

  console.log(
    `${args.isDryRun ? '[DRY RUN] Would process' : 'Processing'} ${targets.length} user(s):`,
  );
  for (const t of targets) console.log(`  - ${t.email} (${t.id})`);

  if (args.isDryRun) {
    await closeDb();
    return;
  }

  let succeeded = 0;
  let failed = 0;
  for (const t of targets) {
    const start = Date.now();
    process.stdout.write(`\n→ ${t.email} ... `);
    try {
      await runInContext(
        { userId: t.id, source: 'admin', isServiceAccount: true, isAdmin: true },
        () =>
          executeCapability('profile.closetRead', {
            locale: 'en',
            reason: 'phase11_backfill',
          }),
      );
      const ms = Date.now() - start;
      console.log(`✓ ok (${(ms / 1000).toFixed(1)}s)`);
      succeeded++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`✗ ${msg}`);
      failed++;
    }
  }

  console.log(`\nDone. ${succeeded} succeeded, ${failed} failed.`);
  await closeDb();
  process.exit(failed > 0 ? 1 : 0);
}

await main();
