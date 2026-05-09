#!/usr/bin/env tsx
/**
 * Phase 11 / D1 — M2 auth linking validation harness.
 *
 * The single make-or-break test before any migration code ships. Confirms
 * that pre-creating a Supabase auth user via the Admin API + a matching
 * `users` row keyed by `auth_user_id` results in Google OAuth LINKING
 * (not creating a duplicate auth user) when the same email signs in.
 *
 * Why this matters: the migration plan relies on writing all 9 users'
 * data keyed to pre-created auth UUIDs. If OAuth sign-in creates a NEW
 * auth user with a different UUID, `apps/api/src/auth.ts:contextFromUserToken`
 * sees no match on `users.auth_user_id` → INSERTs a fresh app users row →
 * the migrated data is orphaned. We MUST verify the link works first.
 *
 * Procedure (Luke runs this; auth UI requires a real Google sign-in):
 *
 *   # 1. Setup — pre-create auth user + app users row for a real Google
 *   #    email Luke controls that is NOT already a Tela user.
 *   ~/bin/doppler run --project tela --config dev -- \
 *     pnpm --filter @tela/capabilities exec tsx \
 *     scripts/validate-auth-linking.ts \
 *     --mode setup --email <real-google-email>
 *
 *   # 2. Sign in with that email at the new app (incognito browser).
 *
 *   # 3. Verify — assert exactly one auth.users + one app users row,
 *   #    auth_user_id matches, google identity present.
 *   ~/bin/doppler run --project tela --config dev -- \
 *     pnpm --filter @tela/capabilities exec tsx \
 *     scripts/validate-auth-linking.ts \
 *     --mode verify --email <real-google-email>
 *
 *   # 4. Cleanup — delete the test user from auth + app tables.
 *   ~/bin/doppler run --project tela --config dev -- \
 *     pnpm --filter @tela/capabilities exec tsx \
 *     scripts/validate-auth-linking.ts \
 *     --mode cleanup --email <real-google-email>
 *
 * If verify reports FAIL, the most common cause is "Allow account linking"
 * being OFF in Supabase Dashboard > Authentication > Settings. Flip it on
 * and re-run.
 */
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { sql } from 'drizzle-orm';

import {
  getDb,
  users,
  DEFAULT_TRY_ON_SETTINGS,
} from '@tela/db';
import { getSupabaseAdmin } from '../src/storage/supabase.js';

interface CliArgs {
  mode: 'setup' | 'verify' | 'cleanup';
  email: string;
  yes: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let mode: CliArgs['mode'] | null = null;
  let email: string | null = null;
  let yes = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${arg} requires a value`);
      return v;
    };
    switch (arg) {
      case '--mode': {
        const v = next();
        if (v !== 'setup' && v !== 'verify' && v !== 'cleanup') {
          throw new Error(`--mode must be one of setup|verify|cleanup (got ${v})`);
        }
        mode = v;
        break;
      }
      case '--email':
        email = next();
        break;
      case '--yes':
      case '-y':
        yes = true;
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
  if (!mode) throw new Error('--mode is required');
  if (!email) throw new Error('--email is required');
  return { mode, email: email.trim().toLowerCase(), yes };
}

function printHelp(): void {
  // eslint-disable-next-line no-console
  console.log(`validate-auth-linking — Phase 11 D1 / M2 validation harness

Usage:
  tsx scripts/validate-auth-linking.ts --mode <setup|verify|cleanup> --email <email> [--yes]

Modes:
  setup    Pre-create an auth user + matching users row keyed by auth_user_id.
           Mirrors what the real migration's pre-create path will do.
  verify   After OAuth sign-in, assert linking succeeded (one auth user,
           one app users row, auth_user_id matches, google identity present).
  cleanup  Delete the test user from auth + app tables.

Flags:
  --email   Real Google email Luke controls; NOT already a Tela user.
  -y, --yes Skip the destructive-action confirmation prompt in cleanup mode.
  -h, --help

Run procedure: see header comment in this file.
`);
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

// ─── Helpers ───

interface AuthUserSummary {
  id: string;
  email: string | null;
  createdAt: string;
  identities: Array<{ provider: string; identityId: string; createdAt?: string }>;
  userMetadata: Record<string, unknown>;
}

async function findAuthUsersByEmail(email: string): Promise<AuthUserSummary[]> {
  const supabase = getSupabaseAdmin();
  const matches: AuthUserSummary[] = [];
  let page = 1;
  const perPage = 200;
  // listUsers paginates the user list but doesn't always populate the
  // `identities` array per row. We collect candidate IDs here, then
  // re-fetch each one via getUserById which DOES return identities.
  const candidateIds: string[] = [];
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`auth.admin.listUsers failed: ${error.message}`);
    const users = data?.users ?? [];
    for (const u of users) {
      if ((u.email ?? '').toLowerCase() === email) {
        candidateIds.push(u.id);
      }
    }
    if (users.length < perPage) break;
    page += 1;
    if (page > 50) break; // safety stop — 10k users
  }

  for (const id of candidateIds) {
    const { data, error } = await supabase.auth.admin.getUserById(id);
    if (error || !data?.user) {
      throw new Error(`auth.admin.getUserById(${id}) failed: ${error?.message ?? 'no user returned'}`);
    }
    const u = data.user;
    matches.push({
      id: u.id,
      email: u.email ?? null,
      createdAt: u.created_at ?? '',
      identities: (u.identities ?? []).map((i) => ({
        provider: i.provider,
        identityId: i.identity_id ?? i.id ?? '',
        createdAt: i.created_at ?? undefined,
      })),
      userMetadata: (u.user_metadata as Record<string, unknown>) ?? {},
    });
  }
  return matches;
}

interface AppUserSummary {
  id: string;
  email: string | null;
  authUserId: string | null;
  onboardingComplete: boolean;
  hasTryOnSettings: boolean;
}

async function findAppUsersByEmail(email: string): Promise<AppUserSummary[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      authUserId: users.authUserId,
      onboardingComplete: users.onboardingComplete,
      tryOnSettings: users.tryOnSettings,
    })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`);
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    authUserId: r.authUserId,
    onboardingComplete: r.onboardingComplete,
    hasTryOnSettings: r.tryOnSettings != null,
  }));
}

// ─── Modes ───

async function runSetup(args: CliArgs): Promise<void> {
  const { email } = args;
  // eslint-disable-next-line no-console
  console.log(`\n[setup] target email: ${email}`);

  // Refuse if state isn't clean — caller should run cleanup first.
  const existingAuth = await findAuthUsersByEmail(email);
  const existingApp = await findAppUsersByEmail(email);
  if (existingAuth.length > 0 || existingApp.length > 0) {
    // eslint-disable-next-line no-console
    console.error(
      `\nERROR: ${existingAuth.length} auth user(s) and ${existingApp.length} app user(s) ` +
        `already exist for ${email}.\n` +
        `Run --mode cleanup first to start from a clean slate, OR use a different email.`,
    );
    if (existingAuth.length > 0) {
      // eslint-disable-next-line no-console
      console.error(`  Auth UIDs: ${existingAuth.map((a) => a.id).join(', ')}`);
    }
    if (existingApp.length > 0) {
      // eslint-disable-next-line no-console
      console.error(`  App user IDs: ${existingApp.map((a) => a.id).join(', ')}`);
    }
    process.exit(1);
  }

  // 1. Pre-create the auth user via Admin API (mirrors M1 strategy).
  const supabase = getSupabaseAdmin();
  // eslint-disable-next-line no-console
  console.log(`[setup] calling supabase.auth.admin.createUser(...)`);
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      m2_validation: true,
      legacy_uid: 'TEST_M2_VALIDATION',
    },
  });
  if (createErr || !created.user) {
    throw new Error(
      `auth.admin.createUser failed: ${createErr?.message ?? 'no user returned'}`,
    );
  }
  const authUserId = created.user.id;
  // eslint-disable-next-line no-console
  console.log(`[setup] auth user created: ${authUserId}`);

  // 2. Pre-create the matching users row (mirrors M3: onboardingComplete=true,
  //    tryOnSettings defaulted).
  const db = getDb();
  // eslint-disable-next-line no-console
  console.log(`[setup] inserting users row keyed by auth_user_id...`);
  const [appUser] = await db
    .insert(users)
    .values({
      authUserId,
      email,
      onboardingComplete: true,
      tryOnSettings: DEFAULT_TRY_ON_SETTINGS,
    })
    .returning({ id: users.id });
  // eslint-disable-next-line no-console
  console.log(`[setup] app users row created: ${appUser.id}`);

  // eslint-disable-next-line no-console
  console.log(`
✓ Pre-create complete.

NEXT STEP — Luke does this:
  1. Open the new app in an incognito browser window.
  2. Click "Sign in with Google".
  3. Sign in with the Google account: ${email}
  4. After the OAuth callback, you should land in the app (NOT the
     /onboarding flow — that's the test of M3).

Then re-run this script in verify mode:
  ~/bin/doppler run --project tela --config dev -- \\
    pnpm --filter @tela/capabilities exec tsx \\
    scripts/validate-auth-linking.ts \\
    --mode verify --email ${email}

Expected pre-create state:
  auth.users.id   : ${authUserId}
  app users.id    : ${appUser.id}
  auth_user_id FK : ${authUserId}
`);
}

async function runVerify(args: CliArgs): Promise<void> {
  const { email } = args;
  // eslint-disable-next-line no-console
  console.log(`\n[verify] target email: ${email}`);

  const authUsers = await findAuthUsersByEmail(email);
  const appUsers = await findAppUsersByEmail(email);

  // eslint-disable-next-line no-console
  console.log(`\nAuth side (Supabase auth.users):`);
  if (authUsers.length === 0) {
    // eslint-disable-next-line no-console
    console.log(`  (none)`);
  } else {
    for (const a of authUsers) {
      // eslint-disable-next-line no-console
      console.log(`  - id=${a.id}`);
      // eslint-disable-next-line no-console
      console.log(`    created_at=${a.createdAt}`);
      // eslint-disable-next-line no-console
      console.log(
        `    identities=[${a.identities.map((i) => i.provider).join(', ') || '(none)'}]`,
      );
      const md = a.userMetadata;
      if (md && (md.m2_validation === true || md.legacy_uid === 'TEST_M2_VALIDATION')) {
        // eslint-disable-next-line no-console
        console.log(`    user_metadata.m2_validation=true (this is the pre-created test user)`);
      }
    }
  }

  // eslint-disable-next-line no-console
  console.log(`\nApp side (users table):`);
  if (appUsers.length === 0) {
    // eslint-disable-next-line no-console
    console.log(`  (none)`);
  } else {
    for (const u of appUsers) {
      // eslint-disable-next-line no-console
      console.log(
        `  - id=${u.id} auth_user_id=${u.authUserId ?? '(null)'} ` +
          `onboarding_complete=${u.onboardingComplete} has_try_on_settings=${u.hasTryOnSettings}`,
      );
    }
  }

  // ─── Assertions ───
  const failures: string[] = [];

  if (authUsers.length === 0) {
    failures.push(`No auth.users row for ${email} — did setup run? Or did cleanup wipe it already?`);
  } else if (authUsers.length > 1) {
    failures.push(
      `Expected exactly 1 auth.users row, got ${authUsers.length}. ` +
        `Likely cause: account linking is OFF and Google OAuth created a duplicate auth user.`,
    );
  }

  const authUser = authUsers[0];
  if (authUser) {
    const providers = new Set(authUser.identities.map((i) => i.provider));
    if (!providers.has('google')) {
      failures.push(
        `Auth user has no 'google' identity (got: ${[...providers].join(', ') || 'none'}). ` +
          `Did Luke complete the OAuth sign-in step? If yes, account linking may be OFF.`,
      );
    }
    // Pre-create with email_confirm=true creates an 'email' identity. After
    // OAuth, both should be present if linking worked.
    if (!providers.has('email')) {
      // Not a hard fail — Supabase versions differ on whether email_confirm
      // creates an identity row. Note for diagnosis only.
      // eslint-disable-next-line no-console
      console.log(
        `\nNOTE: auth user has no 'email' identity. This is OK on some Supabase versions ` +
          `(admin.createUser with email_confirm doesn't always create an identity entry). ` +
          `Only the 'google' identity is required for linking validation.`,
      );
    }
  }

  if (appUsers.length === 0) {
    failures.push(
      `No users row for ${email}. Setup should have created one — investigate.`,
    );
  } else if (appUsers.length > 1) {
    failures.push(
      `Expected exactly 1 users row, got ${appUsers.length}. ` +
        `Linking may have failed: a duplicate was created on first sign-in.`,
    );
  }

  const appUser = appUsers[0];
  if (appUser && authUser) {
    if (appUser.authUserId !== authUser.id) {
      failures.push(
        `users.auth_user_id (${appUser.authUserId}) does not match auth.users.id (${authUser.id}). ` +
          `Linking failed: the OAuth sign-in did not reuse our pre-created auth user.`,
      );
    }
    if (!appUser.onboardingComplete) {
      failures.push(
        `users.onboarding_complete is false. Pre-create should have set this to true; ` +
          `if Luke landed on /onboarding instead of /, that's why.`,
      );
    }
    if (!appUser.hasTryOnSettings) {
      failures.push(
        `users.try_on_settings is null. Pre-create should have seeded defaults.`,
      );
    }
  }

  // eslint-disable-next-line no-console
  console.log(`\n─── Result ───`);
  if (failures.length === 0) {
    // eslint-disable-next-line no-console
    console.log(`✓ PASS — M2 auth linking validation succeeded.

  Auth user ID and app users.auth_user_id match → Google OAuth correctly
  linked to the pre-created auth user instead of creating a duplicate.
  Safe to proceed with migration extensions (D2-D4).

  Don't forget to run --mode cleanup so this email is freed up for any
  future tests.`);
    process.exit(0);
  } else {
    // eslint-disable-next-line no-console
    console.error(`✗ FAIL — M2 auth linking validation failed.\n`);
    for (const f of failures) {
      // eslint-disable-next-line no-console
      console.error(`  - ${f}`);
    }
    // eslint-disable-next-line no-console
    console.error(`\nRemediation:
  - Most common cause: "Allow account linking" is OFF in Supabase
    Dashboard → Authentication → Settings. Flip it ON, run --mode cleanup,
    then re-run setup + verify.
  - If the auth user was created with a DIFFERENT UUID than pre-create,
    that's the smoking gun — linking is OFF.
  - If the app users row was duplicated (not the auth side), investigate
    apps/api/src/auth.ts:contextFromUserToken — the existing-row branch
    isn't matching.

DO NOT proceed with migration extensions until this passes.`);
    process.exit(1);
  }
}

async function runCleanup(args: CliArgs): Promise<void> {
  const { email, yes } = args;
  // eslint-disable-next-line no-console
  console.log(`\n[cleanup] target email: ${email}`);

  const authUsers = await findAuthUsersByEmail(email);
  const appUsers = await findAppUsersByEmail(email);

  if (authUsers.length === 0 && appUsers.length === 0) {
    // eslint-disable-next-line no-console
    console.log(`Nothing to clean up — no auth or app users for ${email}.`);
    return;
  }

  // eslint-disable-next-line no-console
  console.log(
    `Will delete:\n` +
      `  - ${authUsers.length} auth.users row(s) (via supabase.auth.admin.deleteUser)\n` +
      `  - ${appUsers.length} app users row(s) (via DELETE FROM users)\n`,
  );

  if (!yes) {
    const ok = await confirm(`Proceed? [yN]: `);
    if (!ok) {
      // eslint-disable-next-line no-console
      console.log('Aborted.');
      process.exit(0);
      return;
    }
  }

  const supabase = getSupabaseAdmin();
  for (const a of authUsers) {
    // eslint-disable-next-line no-console
    console.log(`[cleanup] auth.admin.deleteUser(${a.id})`);
    const { error } = await supabase.auth.admin.deleteUser(a.id);
    if (error) {
      // eslint-disable-next-line no-console
      console.error(`  ERROR: ${error.message}`);
    }
  }

  if (appUsers.length > 0) {
    const db = getDb();
    // eslint-disable-next-line no-console
    console.log(`[cleanup] DELETE FROM users WHERE lower(email) = '${email}'`);
    await db.execute(sql`DELETE FROM users WHERE lower(email) = ${email}`);
  }

  // eslint-disable-next-line no-console
  console.log(`✓ Cleanup complete.`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  switch (args.mode) {
    case 'setup':
      await runSetup(args);
      break;
    case 'verify':
      await runVerify(args);
      break;
    case 'cleanup':
      await runCleanup(args);
      break;
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('FATAL:', err instanceof Error ? err.message : err);
  if (err instanceof Error && err.stack) {
    // eslint-disable-next-line no-console
    console.error(err.stack);
  }
  process.exit(1);
});
