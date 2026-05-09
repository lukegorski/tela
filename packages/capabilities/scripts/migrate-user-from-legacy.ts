#!/usr/bin/env tsx
/**
 * Multi-mode CLI for the legacy Tela → Supabase migration.
 *
 * Modes (mutually exclusive):
 *   --list                       Print the legacy user inventory (no writes).
 *   --pre-create-users           Pre-create Supabase auth + app users rows
 *                                for each legacy user (mirrors what D1's
 *                                M2 validation manually demonstrated).
 *                                Idempotent.
 *   --legacy-email <email>       Single-user migration (default mode).
 *   --legacy-uid <uid>           Single-user migration with explicit IDs
 *     --new-user-id <uuid>       (use when legacy/new emails differ).
 *   --all                        Multi-user migration: enumerate legacy
 *                                users + run migrateLegacyUser for each.
 *
 * Filters (apply to --pre-create-users and --all):
 *   --skip user1@x,user2@y       Comma-separated emails to exclude.
 *   --only user1@x,user2@y       Comma-separated emails to include only.
 *
 * Other flags:
 *   --dry-run                    Preview only — no DB writes / image uploads.
 *   --only profile|wardrobe|outfits|all  Restrict per-user migration scope.
 *   --include-images             Transfer images Firebase → Supabase.
 *   --include-outfits            Migrate outfits incl. synthetic ctx + gen.
 *   -y, --yes                    Skip the M11 interactive confirmation.
 *   -h, --help
 *
 * Read docs/phase-11-multi-user-migration.md for the full spec
 * (decisions M1-M12). Wraps the migrateLegacyUser library.
 *
 * Run procedure (M10): copy 4 legacy env vars to Doppler dev, then:
 *   ~/bin/doppler run --project tela --config dev -- \
 *     pnpm --filter @tela/capabilities exec tsx \
 *     scripts/migrate-user-from-legacy.ts <flags>
 */
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import {
  migrateLegacyUser,
  resolveIdsByEmail,
  preCreateUser,
  enumerateLegacyUsers,
  applyEmailFilters,
} from '../src/migration/index.js';
import type {
  MigrateOptions,
  MigrateResult,
  PreCreateResult,
} from '../src/migration/index.js';
import { getLegacyDb } from '../src/migration/firebase.js';

type Mode = 'list' | 'pre-create-users' | 'all' | 'single';

interface CliArgs {
  mode: Mode;
  // single-user (mode='single')
  legacyEmail?: string;
  legacyUid?: string;
  newUserId?: string;
  // filters (mode='pre-create-users' | 'all')
  skip: string[];
  only: string[];
  // shared
  dryRun: boolean;
  onlySection: 'profile' | 'wardrobe' | 'outfits' | 'all';
  includeImages: boolean;
  includeOutfits: boolean;
  includeChat: boolean;
  yes: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let mode: Mode | null = null;
  const args: CliArgs = {
    mode: 'single',
    skip: [],
    only: [],
    dryRun: false,
    onlySection: 'all',
    includeImages: false,
    includeOutfits: false,
    includeChat: false,
    yes: false,
  };

  const setMode = (next: Mode, source: string) => {
    if (mode !== null && mode !== next) {
      throw new Error(`${source} conflicts with --${mode} (modes are mutually exclusive)`);
    }
    mode = next;
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${arg} requires a value`);
      return v;
    };
    switch (arg) {
      case '--list':
        setMode('list', '--list');
        break;
      case '--pre-create-users':
        setMode('pre-create-users', '--pre-create-users');
        break;
      case '--all':
        setMode('all', '--all');
        break;
      case '--legacy-email':
        args.legacyEmail = next();
        setMode('single', '--legacy-email');
        break;
      case '--legacy-uid':
        args.legacyUid = next();
        setMode('single', '--legacy-uid');
        break;
      case '--new-user-id':
        args.newUserId = next();
        setMode('single', '--new-user-id');
        break;
      case '--skip':
        args.skip = next().split(',').map((s) => s.trim()).filter(Boolean);
        break;
      case '--only': {
        // Two semantics for --only depending on its argument shape:
        //   --only <emails>   filter list (used with --pre-create-users / --all)
        //   --only <section>  scope a single-user migration (profile|wardrobe|outfits|all)
        const v = next();
        if (v === 'profile' || v === 'wardrobe' || v === 'outfits' || v === 'all') {
          args.onlySection = v;
        } else {
          args.only = v.split(',').map((s) => s.trim()).filter(Boolean);
        }
        break;
      }
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--include-images':
        args.includeImages = true;
        break;
      case '--include-outfits':
        args.includeOutfits = true;
        break;
      case '--include-chat':
        args.includeChat = true;
        break;
      case '--yes':
      case '-y':
        args.yes = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown arg: ${arg}`);
    }
  }
  args.mode = mode ?? 'single';
  return args;
}

function printHelp(): void {
  // eslint-disable-next-line no-console
  console.log(`migrate-user-from-legacy — Phase 11 multi-user migration CLI

Modes (mutually exclusive — pick one):
  --list                       Print legacy user inventory (no writes).
  --pre-create-users           Pre-create Supabase auth + app users for
                               each legacy user (mirrors D1 / M2). Idempotent.
  --legacy-email <email>       Single-user migration (default).
  --legacy-uid <uid>
    --new-user-id <uuid>       Single-user migration with explicit IDs.
  --all                        Multi-user migration over all legacy users.

Filters (apply to --pre-create-users and --all):
  --skip <emails>              Comma-separated emails to exclude.
  --only <emails>              Comma-separated emails to include only.

Per-user migration flags (apply to --legacy-email / --legacy-uid / --all):
  --dry-run                    Preview only — no writes.
  --only <section>             profile|wardrobe|outfits|all (default: all).
  --include-images             Transfer images Firebase → Supabase.
  --include-outfits            Migrate outfits + synthetic ctx + gen.
  --include-chat               Migrate chat history (M5).
  -y, --yes                    Skip M11 interactive confirmation.
  -h, --help                   Show this help.

Examples:

  # See who would be migrated
  ... --list

  # Pre-create everyone (idempotent — safe to re-run)
  ... --pre-create-users
  ... --pre-create-users --skip a@x.com,b@y.com
  ... --pre-create-users --only luke@lukegorski.com

  # Dry-run a single user
  ... --legacy-email luke@lukegorski.com --dry-run \\
        --include-images --include-outfits

  # Real run for a single user
  ... --legacy-email luke@lukegorski.com \\
        --include-images --include-outfits

  # Real run for all users (after pre-create + verification)
  ... --all --include-images --include-outfits --include-chat --yes

Run procedure: see docs/phase-11-multi-user-migration.md (M10).
`);
}

// ─── Helpers ───

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input, output });
  try {
    const answer = (await rl.question(question)).trim().toLowerCase();
    return answer === 'y' || answer === 'yes';
  } finally {
    rl.close();
  }
}

async function readPreviewCounts(args: { legacyUid: string }): Promise<{
  wardrobeItems: number;
  outfits: number;
  syntheticContexts: number;
}> {
  const legacyDb = getLegacyDb();
  const userRef = legacyDb.collection('users').doc(args.legacyUid);
  const [itemsSnap, outfitsSnap] = await Promise.all([
    userRef.collection('wardrobeItems').get(),
    userRef.collection('outfits').get(),
  ]);
  const tuples = new Set<string>();
  for (const doc of outfitsSnap.docs) {
    const data = doc.data() as { occasion?: string; season?: string[] };
    const occasion = data.occasion ?? 'Everyday';
    const seasonRaw = (data.season?.[0] ?? '').toLowerCase();
    const season =
      seasonRaw === 'spring' || seasonRaw === 'summer' || seasonRaw === 'fall' || seasonRaw === 'winter'
        ? seasonRaw
        : 'fall';
    tuples.add(`${occasion}::${season}`);
  }
  return {
    wardrobeItems: itemsSnap.size,
    outfits: outfitsSnap.size,
    syntheticContexts: tuples.size,
  };
}

// ─── Mode handlers ───

async function runList(): Promise<void> {
  const records = await enumerateLegacyUsers();
  records.sort((a, b) => a.email.localeCompare(b.email));
  // eslint-disable-next-line no-console
  console.log(`\nLegacy user inventory (${records.length} users):\n`);
  for (const r of records) {
    // eslint-disable-next-line no-console
    console.log(
      `  ${r.email.padEnd(40)}  uid=${r.legacyUid.padEnd(30)}  name=${r.displayName ?? '(none)'}`,
    );
  }
  // eslint-disable-next-line no-console
  console.log('');
}

async function runPreCreate(args: CliArgs): Promise<void> {
  const all = await enumerateLegacyUsers();
  const filtered = applyEmailFilters(all, { skip: args.skip, only: args.only });
  // eslint-disable-next-line no-console
  console.log(
    `\nPre-creating ${filtered.length} of ${all.length} legacy users` +
      (args.skip.length ? ` (skipping ${args.skip.length})` : '') +
      (args.only.length ? ` (only ${args.only.length})` : '') +
      '\n',
  );

  if (filtered.length === 0) {
    // eslint-disable-next-line no-console
    console.log('Nothing to do.');
    return;
  }

  const results: PreCreateResult[] = [];
  const failures: Array<{ email: string; reason: string }> = [];
  for (const record of filtered) {
    try {
      const result = await preCreateUser(record.email);
      results.push(result);
      // eslint-disable-next-line no-console
      console.log(
        `  ✓ ${record.email.padEnd(40)}  ` +
          (result.actions.length === 0
            ? '(no-op — already prepared)'
            : `actions: [${result.actions.join(', ')}]`),
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      failures.push({ email: record.email, reason });
      // eslint-disable-next-line no-console
      console.error(`  ✗ ${record.email.padEnd(40)}  ${reason}`);
    }
  }

  // eslint-disable-next-line no-console
  console.log(`\nSummary: ${results.length} pre-created/healed, ${failures.length} failed.`);
  if (failures.length > 0) {
    process.exit(1);
  }
}

async function runAll(args: CliArgs): Promise<void> {
  const all = await enumerateLegacyUsers();
  const filtered = applyEmailFilters(all, { skip: args.skip, only: args.only });
  // eslint-disable-next-line no-console
  console.log(
    `\nMigrating ${filtered.length} of ${all.length} legacy users` +
      (args.skip.length ? ` (skipping ${args.skip.length})` : '') +
      (args.only.length ? ` (only ${args.only.length})` : '') +
      `, dryRun=${args.dryRun}, includeImages=${args.includeImages}, includeOutfits=${args.includeOutfits}, includeChat=${args.includeChat}` +
      '\n',
  );

  if (filtered.length === 0) {
    // eslint-disable-next-line no-console
    console.log('Nothing to do.');
    return;
  }

  if (!args.dryRun && !args.yes) {
    const ok = await confirm(`Proceed with multi-user migration? [yN]: `);
    if (!ok) {
      // eslint-disable-next-line no-console
      console.log('Aborted.');
      process.exit(0);
      return;
    }
  }

  const opts: MigrateOptions = {
    dryRun: args.dryRun,
    only: args.onlySection,
    includeImages: args.includeImages,
    includeOutfits: args.includeOutfits,
    includeChat: args.includeChat,
  };

  const totals = {
    migrated: 0,
    failed: 0,
    perUser: [] as Array<{ email: string; result?: MigrateResult; reason?: string }>,
  };

  for (const record of filtered) {
    // eslint-disable-next-line no-console
    console.log(`\n──── ${record.email} ────`);
    try {
      const ids = await resolveIdsByEmail(record.email);
      const result = await migrateLegacyUser(ids.legacyUid, ids.newUserId, opts);
      totals.migrated += 1;
      totals.perUser.push({ email: record.email, result });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      totals.failed += 1;
      totals.perUser.push({ email: record.email, reason });
      // eslint-disable-next-line no-console
      console.error(`  ✗ ${record.email}: ${reason}`);
    }
  }

  // eslint-disable-next-line no-console
  console.log(`\n──── Summary ────`);
  // eslint-disable-next-line no-console
  console.log(
    `  ${totals.migrated} migrated, ${totals.failed} failed (out of ${filtered.length})`,
  );
  for (const u of totals.perUser) {
    if (u.reason) {
      // eslint-disable-next-line no-console
      console.log(`  ✗ ${u.email}: ${u.reason}`);
    } else if (u.result) {
      const r = u.result;
      // eslint-disable-next-line no-console
      console.log(
        `  ✓ ${u.email}: profile=${r.profile.fieldsUpdated.length} fields, ` +
          `wardrobe=${r.wardrobe.migrated} migrated/${r.wardrobe.skipped.length} skipped, ` +
          `outfits=${r.outfits.migrated} migrated/${r.outfits.skipped.length} skipped, ` +
          `tryOns=${r.tryOns.migrated} migrated/${r.tryOns.skipped.length} skipped, ` +
          `chat=${r.chat.messagesMigrated} msgs/${r.chat.messagesSkipped.length} skipped`,
      );
    }
  }
  if (totals.failed > 0) {
    process.exit(1);
  }
}

async function runSingle(args: CliArgs): Promise<void> {
  // ─── Resolve identity (M9) ───
  let legacyUid: string;
  let legacyEmail: string;
  let newUserId: string;
  let newEmail: string;
  if (args.legacyEmail) {
    const r = await resolveIdsByEmail(args.legacyEmail);
    legacyUid = r.legacyUid;
    legacyEmail = r.legacyEmail;
    newUserId = r.newUserId;
    newEmail = r.newEmail;
  } else if (args.legacyUid && args.newUserId) {
    legacyUid = args.legacyUid;
    legacyEmail = '(provided via --legacy-uid)';
    newUserId = args.newUserId;
    newEmail = '(provided via --new-user-id)';
  } else {
    // eslint-disable-next-line no-console
    console.error(
      'ERROR: pass either --legacy-email <email>, or both --legacy-uid <uid> and --new-user-id <uuid>.\n' +
        'For multi-user mode, use --pre-create-users / --all / --list instead.',
    );
    printHelp();
    process.exit(2);
    return;
  }

  // ─── Preview (M11) ───
  const counts = await readPreviewCounts({ legacyUid });

  // eslint-disable-next-line no-console
  console.log(`
Resolved IDs:
  Legacy uid:    ${legacyUid} (email: ${legacyEmail})
  New user_id:   ${newUserId} (email: ${newEmail})

About to migrate (only=${args.onlySection}, includeImages=${args.includeImages}, includeOutfits=${args.includeOutfits}, dryRun=${args.dryRun}):
  - Profile: non-destructive merge — only fills empty new-app fields
  - Wardrobe: ${counts.wardrobeItems} legacy items
  - Outfits: ${counts.outfits} legacy outfits
  - Synthetic ctx tuples: ${counts.syntheticContexts}
`);

  const needsConfirmation = !args.dryRun && !args.yes;
  if (needsConfirmation) {
    const ok = await confirm('Proceed? [yN]: ');
    if (!ok) {
      // eslint-disable-next-line no-console
      console.log('Aborted.');
      process.exit(0);
      return;
    }
  }

  const opts: MigrateOptions = {
    dryRun: args.dryRun,
    only: args.onlySection,
    includeImages: args.includeImages,
    includeOutfits: args.includeOutfits,
    includeChat: args.includeChat,
  };

  let result: MigrateResult;
  try {
    result = await migrateLegacyUser(legacyUid, newUserId, opts);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`\nFATAL: migration aborted — ${err instanceof Error ? err.message : err}`);
    if (err instanceof Error && err.stack) {
      // eslint-disable-next-line no-console
      console.error(err.stack);
    }
    process.exit(1);
    return;
  }

  printSingleSummary(result, args);
}

function printSingleSummary(result: MigrateResult, args: CliArgs): void {
  const lines: string[] = [];
  lines.push('');
  lines.push(`✓ Done in ${(result.durationMs / 1000).toFixed(1)}s`);
  lines.push('');
  if (result.profile.fieldsUpdated.length > 0) {
    lines.push(`✓ Profile fields ${args.dryRun ? 'WOULD update' : 'merged'}: ${result.profile.fieldsUpdated.join(', ')}`);
  } else {
    lines.push('  Profile: nothing to update');
  }
  if (args.includeImages) {
    lines.push(
      `✓ ${args.dryRun ? 'WOULD migrate' : 'Migrated'} ${result.wardrobe.migrated} wardrobe items ` +
        `(${result.wardrobe.imagesTransferred} images transferred, ` +
        `${result.wardrobe.skipped.length} skipped)`,
    );
    if (result.wardrobe.skipped.length > 0) {
      for (const s of result.wardrobe.skipped.slice(0, 10)) {
        lines.push(`    - ${s.legacyId}: ${s.reason}`);
      }
      if (result.wardrobe.skipped.length > 10) {
        lines.push(`    (and ${result.wardrobe.skipped.length - 10} more — see migration_failures table)`);
      }
    }
  }
  if (args.includeOutfits) {
    lines.push(
      `✓ ${args.dryRun ? 'WOULD migrate' : 'Migrated'} ${result.outfits.migrated} outfits ` +
        `(${result.outfits.skipped.length} skipped, ` +
        `${result.outfits.syntheticContextsCreated} synthetic contexts created, ` +
        `${result.outfits.syntheticGenerationsCreated} synthetic generations created)`,
    );
    if (result.outfits.skipped.length > 0) {
      for (const s of result.outfits.skipped.slice(0, 10)) {
        lines.push(`    - ${s.legacyId}: ${s.reason}`);
      }
    }
    // Try-on stats (M4) — same gate as outfits since try-ons attach to outfits.
    lines.push(
      `✓ ${args.dryRun ? 'WOULD migrate' : 'Migrated'} ${result.tryOns.migrated} try-ons ` +
        `(${result.tryOns.skipped.length} skipped, ` +
        `${result.tryOns.imagesFailed.length} image-transfer failures)`,
    );
    if (result.tryOns.skipped.length > 0) {
      for (const s of result.tryOns.skipped.slice(0, 10)) {
        lines.push(`    - ${s.legacyOutfitId}: ${s.reason}`);
      }
      if (result.tryOns.skipped.length > 10) {
        lines.push(`    (and ${result.tryOns.skipped.length - 10} more — see migration_failures table)`);
      }
    }
  }
  if (args.includeChat) {
    lines.push(
      `✓ ${args.dryRun ? 'WOULD migrate' : 'Migrated'} ${result.chat.messagesMigrated} chat messages ` +
        `(conversation ${result.chat.conversationCreated ? 'created' : 'reused'}, ` +
        `${result.chat.legacyAttachmentsPreserved} legacy URLs preserved, ` +
        `${result.chat.wardrobeAttachmentsResolved} wardrobe refs resolved, ` +
        `${result.chat.messagesSkipped.length} skipped)`,
    );
    if (result.chat.messagesSkipped.length > 0) {
      for (const s of result.chat.messagesSkipped.slice(0, 5)) {
        lines.push(`    - ${s.legacyId}: ${s.reason}`);
      }
    }
  }
  lines.push('');
  if (!args.dryRun) {
    lines.push('NEXT STEP: open /en/wardrobe in your browser to verify visually.');
    lines.push('Your style profile will regenerate from your imported wardrobe the next');
    lines.push('time you generate an outfit (e.g., open /en/outfits and tap +).');
  }
  // eslint-disable-next-line no-console
  console.log(lines.join('\n'));
}

// ─── Entry ───

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  switch (args.mode) {
    case 'list':
      await runList();
      break;
    case 'pre-create-users':
      await runPreCreate(args);
      break;
    case 'all':
      await runAll(args);
      break;
    case 'single':
      await runSingle(args);
      break;
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('FATAL:', err);
  process.exit(1);
});
