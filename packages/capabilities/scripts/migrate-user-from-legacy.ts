#!/usr/bin/env tsx
/**
 * One-shot CLI: migrate a single user from the legacy Tela app
 * (Firebase) into the new Supabase backend. Wraps the
 * `migrateLegacyUser` library at `../src/migration/migrateLegacyUser.ts`.
 *
 * Read `docs/migration-luke-one-shot.md` for the full spec
 * (decisions M1-M12). Run procedure (M10):
 *
 *   ~/bin/doppler run --project tela --config dev -- \
 *     pnpm --filter @tela/capabilities exec tsx \
 *     scripts/migrate-user-from-legacy.ts \
 *     --legacy-email luke@lukegorski.com --dry-run
 *
 * Then re-run without `--dry-run` to actually migrate. The M11 confirmation
 * gate prints the resolved IDs + preview counts and waits for `y` before
 * any DB writes or image transfers.
 *
 * D.13a (no images, no outfits) and D.13b (full) are toggled with the
 * `--include-images` / `--include-outfits` flags. D.13a runs without
 * either; D.13b enables both.
 */
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import {
  migrateLegacyUser,
  resolveIdsByEmail,
} from '../src/migration/index.js';
import type { MigrateOptions, MigrateResult } from '../src/migration/index.js';
import { getLegacyDb } from '../src/migration/firebase.js';

interface CliArgs {
  legacyEmail?: string;
  legacyUid?: string;
  newUserId?: string;
  dryRun: boolean;
  only: 'profile' | 'wardrobe' | 'outfits' | 'all';
  includeImages: boolean;
  includeOutfits: boolean;
  yes: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    dryRun: false,
    only: 'all',
    includeImages: false,
    includeOutfits: false,
    yes: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${arg} requires a value`);
      return v;
    };
    switch (arg) {
      case '--legacy-email':
        args.legacyEmail = next();
        break;
      case '--legacy-uid':
        args.legacyUid = next();
        break;
      case '--new-user-id':
        args.newUserId = next();
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--only': {
        const v = next();
        if (v !== 'profile' && v !== 'wardrobe' && v !== 'outfits' && v !== 'all') {
          throw new Error(`--only must be one of profile|wardrobe|outfits|all (got ${v})`);
        }
        args.only = v;
        break;
      }
      case '--include-images':
        args.includeImages = true;
        break;
      case '--include-outfits':
        args.includeOutfits = true;
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
  return args;
}

function printHelp(): void {
  // eslint-disable-next-line no-console
  console.log(`migrate-user-from-legacy — one-shot legacy Tela → Supabase user migration

Usage:
  tsx scripts/migrate-user-from-legacy.ts --legacy-email <email> [flags]
  tsx scripts/migrate-user-from-legacy.ts --legacy-uid <uid> --new-user-id <uuid> [flags]

Flags:
  --legacy-email <email>      Resolve both legacy uid + new user_id by email (default mode).
  --legacy-uid <uid>          Override legacy uid resolution.
  --new-user-id <uuid>        Override new user_id resolution. Required with --legacy-uid.
  --dry-run                   Preview only — no DB writes, no image uploads, no confirmation prompt.
  --only <section>            Restrict to one section: profile|wardrobe|outfits|all (default: all).
  --include-images            Transfer images Firebase → Supabase (D.13b).
  --include-outfits           Migrate outfits incl. synthetic context+generation (D.13b).
  -y, --yes                   Skip the M11 interactive confirmation prompt (use with care).
  -h, --help                  Show this help.

Run procedure (per migration M10):

  1. Copy 4 env vars from /Users/lukegorski/ale/.env.local to Doppler dev
     (FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL,
      FIREBASE_ADMIN_PRIVATE_KEY, NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET).
  2. Dry-run first:
       ~/bin/doppler run --project tela --config dev -- \\
         pnpm --filter @tela/capabilities exec tsx \\
         scripts/migrate-user-from-legacy.ts \\
         --legacy-email luke@lukegorski.com --dry-run
  3. Real run (interactive y/N gate):
       ~/bin/doppler run --project tela --config dev -- \\
         pnpm --filter @tela/capabilities exec tsx \\
         scripts/migrate-user-from-legacy.ts \\
         --legacy-email luke@lukegorski.com \\
         --include-images --include-outfits
  4. Remove the 4 legacy env vars from Doppler.
`);
}

async function readPreviewCounts(args: {
  legacyUid: string;
  newUserId: string;
}): Promise<{ wardrobeItems: number; outfits: number; syntheticContexts: number }> {
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

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input, output });
  try {
    const answer = (await rl.question(question)).trim().toLowerCase();
    return answer === 'y' || answer === 'yes';
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

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
      'ERROR: either --legacy-email, or both --legacy-uid and --new-user-id, are required.',
    );
    printHelp();
    process.exit(2);
    return;
  }

  // ─── Preview (M11) ───
  const counts = await readPreviewCounts({ legacyUid, newUserId });

  // eslint-disable-next-line no-console
  console.log(`
Resolved IDs:
  Legacy uid:    ${legacyUid} (email: ${legacyEmail})
  New user_id:   ${newUserId} (email: ${newEmail})

About to migrate (only=${args.only}, includeImages=${args.includeImages}, includeOutfits=${args.includeOutfits}, dryRun=${args.dryRun}):
  - Profile: non-destructive merge — only fills empty new-app fields
  - Wardrobe: ${counts.wardrobeItems} legacy items
  - Outfits: ${counts.outfits} legacy outfits
  - Synthetic ctx tuples: ${counts.syntheticContexts}
`);

  // Skip confirmation in dry-run, on --yes, or when only=profile (low blast radius).
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

  // ─── Run ───
  const opts: MigrateOptions = {
    dryRun: args.dryRun,
    only: args.only,
    includeImages: args.includeImages,
    includeOutfits: args.includeOutfits,
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

  // ─── Summary ───
  printSummary(result, args);
}

function printSummary(result: MigrateResult, args: CliArgs): void {
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

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('FATAL:', err);
  process.exit(1);
});
