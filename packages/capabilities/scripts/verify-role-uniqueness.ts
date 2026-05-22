#!/usr/bin/env tsx
/**
 * Role-uniqueness verification — runs N outfit generations against a user's
 * wardrobe and asserts the three-layer defense holds:
 *
 *   (a) Application-layer dedup in outfit/generate.ts drops AI-emitted dupes
 *       before insert (telemetered via 'outfit.role_duplicate_dropped' events).
 *   (b) Partial unique index on outfit_items (outfit_id, role) WHERE
 *       role <> 'accessory' would atomically reject any insertion that
 *       bypassed (a). Tested separately in /tmp/tela-verify-constraint.mjs.
 *   (c) Updated outfit.generate prompt v4178166d adds explicit Hard rule.
 *
 * Reports:
 *   - count of generations attempted / succeeded / errored
 *   - count of outfits with duplicate non-accessory roles in DB (MUST be 0)
 *   - count of dedup-drop events emitted (telemetry — > 0 is fine, proves
 *     dedup is doing work; > N/2 = prompt change isn't biting hard enough)
 *   - total cost in cents
 *
 * Usage:
 *   ~/bin/doppler run --project tela --config dev -- \
 *     pnpm --filter @tela/capabilities exec tsx \
 *     scripts/verify-role-uniqueness.ts [--user-id <uuid>] [--n <N>]
 *
 * Defaults: Luke (cd83153d...), N=20.
 */
import { sql } from 'drizzle-orm';
import { getDb, closeDb } from '@tela/db';
import { runInContext, executeCapability } from '@tela/capabilities';

interface Args {
  userId: string;
  n: number;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    userId: 'cd83153d-1d56-4ac2-8c6b-4d03945c2244',
    n: 20,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--user-id' && argv[i + 1]) out.userId = argv[++i].trim();
    else if (a === '--n' && argv[i + 1]) out.n = parseInt(argv[++i], 10);
    else if (a === '-h' || a === '--help') {
      console.log('Usage: --user-id <uuid> --n <N>');
      process.exit(0);
    } else {
      console.error(`Unknown arg: ${a}`);
      process.exit(2);
    }
  }
  if (!out.userId.match(/^[0-9a-f-]{36}$/i)) {
    console.error(`Invalid user-id: ${out.userId}`);
    process.exit(2);
  }
  if (out.n < 1 || out.n > 100) {
    console.error(`N must be between 1 and 100; got ${out.n}`);
    process.exit(2);
  }
  return out;
}

type CtxResult = {
  contextId: string;
};

type GenResult = {
  outfits: Array<{ id: string }>;
  generationId: string;
  costCents: number;
  duplicatesRejected: number;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const db = getDb();

  console.log(`Verifying role uniqueness for user=${args.userId} across N=${args.n} generations.\n`);

  const startedAt = new Date();
  let succeeded = 0;
  let errored = 0;
  let totalCostCents = 0;
  const errors: string[] = [];
  const newOutfitIds: string[] = [];

  for (let i = 1; i <= args.n; i++) {
    process.stdout.write(`[${i}/${args.n}] ... `);
    const tStart = Date.now();
    try {
      const result = await runInContext(
        { userId: args.userId, source: 'admin', isServiceAccount: true, isAdmin: true },
        async () => {
          const ctx = (await executeCapability('context.assemble', {
            occasion: 'everyday',
            calendarContext: null,
          })) as unknown as CtxResult;
          return (await executeCapability('outfit.generate', {
            contextId: ctx.contextId,
            count: 3,
          })) as unknown as GenResult;
        },
      );
      const ms = Date.now() - tStart;
      totalCostCents += result.costCents;
      for (const o of result.outfits) newOutfitIds.push(o.id);
      console.log(
        `✓ ${result.outfits.length} outfits, cost=${result.costCents.toFixed(2)}¢, ${(ms / 1000).toFixed(1)}s` +
          (result.duplicatesRejected > 0 ? ` (${result.duplicatesRejected} candidate(s) rejected pre-insert)` : ''),
      );
      succeeded++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`✗ ${msg}`);
      errors.push(msg);
      errored++;
    }
  }

  // ─── Inspect DB for actual duplicates among just-created outfits ───
  // Drizzle's sql tag doesn't bind JS arrays cleanly to Postgres ANY/IN
  // (per backfill-style-profiles.ts:67); we filter by user_id + the run's
  // start timestamp instead. Equivalent here because no other workload
  // is inserting outfits for this user during the verification window.
  console.log('\n=== DB inspection ===');
  type DupRow = { outfit_id: string; role: string; n: number };
  const dupRows = (await db.execute<DupRow>(sql`
    SELECT oi.outfit_id::text AS outfit_id, oi.role, COUNT(*)::int AS n
    FROM outfit_items oi
    JOIN outfits o ON o.id = oi.outfit_id
    WHERE oi.role <> 'accessory'
      AND o.user_id::text = ${args.userId}
      AND o.created_at >= ${startedAt.toISOString()}::timestamptz
    GROUP BY oi.outfit_id, oi.role
    HAVING COUNT(*) > 1
  `)) as unknown as DupRow[];
  if (dupRows.length === 0) {
    console.log(`  ✓ ZERO duplicate non-accessory roles across ${newOutfitIds.length} new outfit(s)`);
  } else {
    console.log(`  ✗ FOUND ${dupRows.length} duplicate role(s) in newly-created outfits:`);
    for (const row of dupRows) console.log(`    outfit=${row.outfit_id} role=${row.role} n=${row.n}`);
  }

  // ─── Inspect events for dedup-drop telemetry ───
  type EventRow = { count: number; total_dropped: number };
  const eventRows = (await db.execute<EventRow>(sql`
    SELECT COUNT(*)::int AS count,
           COALESCE(SUM((payload->>'droppedCount')::int), 0)::int AS total_dropped
    FROM events
    WHERE type = 'outfit.role_duplicate_dropped'
      AND user_id::text = ${args.userId}
      AND timestamp >= ${startedAt.toISOString()}::timestamptz
  `)) as unknown as EventRow[];
  const evt = eventRows[0] ?? { count: 0, total_dropped: 0 };
  console.log(
    `  dedup-drop events: ${evt.count} outfit(s) had drops, ${evt.total_dropped} total item(s) dropped`,
  );

  // Classify errors: budget cap and "all rejected" (pairing-key dupes against
  // prior outfits) are expected behaviors of the surrounding system, not
  // defects in the role-uniqueness fix this script verifies. Any other error
  // is unexpected and warrants attention.
  const expectedErrorPatterns = [/Daily spend limit reached/i, /all were rejected/i];
  const unexpectedErrors = errors.filter(
    (e) => !expectedErrorPatterns.some((p) => p.test(e)),
  );

  // ─── Summary ───
  console.log('\n=== SUMMARY ===');
  console.log(`generations: ${succeeded} ✓ / ${errored} ✗ / ${args.n} total`);
  console.log(`new outfits: ${newOutfitIds.length}`);
  console.log(`total cost: ${(totalCostCents / 100).toFixed(4)} USD (${totalCostCents.toFixed(2)}¢)`);
  console.log(`avg cost per generation: ${succeeded > 0 ? (totalCostCents / succeeded).toFixed(2) : 'n/a'}¢`);
  if (errors.length > 0) {
    console.log(`\nerror samples (${errors.length} total, ${unexpectedErrors.length} unexpected):`);
    for (const e of errors.slice(0, 3)) console.log(`  - ${e}`);
  }

  await closeDb();

  // DoD: zero actual duplicates AND no unexpected errors. Budget-cap and
  // pairing-key-rejection errors don't fail the run — they're orthogonal
  // to the role-uniqueness assertion.
  const pass = dupRows.length === 0 && unexpectedErrors.length === 0;
  console.log(`\n${pass ? '✓ PASS' : '✗ FAIL'}`);
  process.exit(pass ? 0 : 1);
}

await main();
