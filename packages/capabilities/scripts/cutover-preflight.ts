#!/usr/bin/env tsx
/**
 * Cutover day-of preflight. Aggregates the read-only checks that gate
 * the DNS flip, into a single command with PASS/FAIL semantics. Designed
 * to be run twice:
 *
 *   1. Baseline (some hours before cutover):
 *        ... cutover-preflight.ts --out cutover-baseline.json
 *      Snapshots the current state to JSON. Save the file outside the
 *      repo (e.g., ~/Desktop/).
 *
 *   2. Day-of, T-1h:
 *        ... cutover-preflight.ts --diff cutover-baseline.json
 *      Re-runs all checks and reports any drift from the baseline.
 *      Exits non-zero if any check FAILs or any baseline value drifted.
 *
 * Checks (all read-only, no DB writes, no Railway mutations):
 *   - DNS:   telastyle.app apex A/AAAA. Records pre-cutover state so the
 *            day-of run can confirm DNS hasn't moved unexpectedly.
 *   - Railway: GET /api/health on tela-web AND /health on tela. Both
 *            must return 200. Latency captured in ms.
 *   - Landing: GET / on tela-web → must 307 to /<locale>.
 *   - Users:  For each provided email, counts of closet_items, outfits,
 *            try_on_jobs (complete), chat_messages. Also has_style_profile.
 *            Day-of run flags any drift > 0 in either direction (an
 *            unexpected delete during the cutover window is just as bad
 *            as an unexpected insert).
 *   - Signed URLs: spot-check 5 random closet_items signed URLs per user.
 *            Failure here usually means storage path drift between
 *            migration and present.
 *
 * Exit codes:
 *   0 — all checks PASS and (if --diff) no drift
 *   1 — at least one check FAIL or drift detected
 *   2 — usage error
 *
 * Usage:
 *   ~/bin/doppler run --project tela --config dev -- \
 *     pnpm --filter @tela/capabilities exec tsx \
 *     scripts/cutover-preflight.ts \
 *     [--out <baseline.json>] [--diff <baseline.json>] \
 *     [--email <email>]...
 *
 * If no --email is provided, defaults to the 4 active migrated users.
 */
import { sql } from 'drizzle-orm';
import { getDb, closeDb } from '@tela/db';
import { getSupabaseAdmin, ITEM_PHOTOS_BUCKET } from '../src/storage/supabase.js';
import { promises as dns } from 'node:dns';
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

// ─── CLI ──────────────────────────────────────────────────────────────────────

interface Args {
  out: string | null;
  diff: string | null;
  emails: string[];
}

function parseArgs(argv: string[]): Args {
  const out: Args = { out: null, diff: null, emails: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out' && argv[i + 1]) out.out = argv[++i];
    else if (a === '--diff' && argv[i + 1]) out.diff = argv[++i];
    else if (a === '--email' && argv[i + 1]) out.emails.push(argv[++i].trim().toLowerCase());
    else if (a === '-h' || a === '--help') {
      console.log(
        'Usage: cutover-preflight.ts [--out <baseline.json>] [--diff <baseline.json>] [--email <email>]...',
      );
      process.exit(0);
    } else {
      console.error(`Unknown arg: ${a}`);
      process.exit(2);
    }
  }
  return out;
}

const DEFAULT_EMAILS = [
  'luke@lukegorski.com',
  'marinasramosguimaraes@gmail.com',
  'isaac.trujillo.villegas@gmail.com',
  'licearomano@gmail.com',
];

// ─── Endpoint constants ───────────────────────────────────────────────────────

const RAILWAY_WEB = 'https://tela-web-development.up.railway.app';
const RAILWAY_API = 'https://tela-development.up.railway.app';
const LEGACY_APEX = 'telastyle.app';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Snapshot {
  timestamp: string;
  dns: {
    apex_a_records: string[];
    apex_aaaa_records: string[];
  };
  railway: {
    tela_web_health: { status: number; latency_ms: number };
    tela_api_health: { status: number; latency_ms: number };
    tela_web_landing: { status: number; location?: string };
  };
  users: Record<string, UserSnapshot>;
  failures: string[];
}

interface UserSnapshot {
  user_id: string;
  has_style_profile: boolean;
  closet_items: number;
  outfits: number;
  try_ons_complete: number;
  chat_messages: number;
  signed_urls_checked: number;
  signed_urls_ok: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchEndpoint(
  url: string,
): Promise<{ status: number; latency_ms: number; location?: string }> {
  const start = performance.now();
  const res = await fetch(url, { method: 'GET', redirect: 'manual' });
  const latency_ms = Math.round(performance.now() - start);
  await res.body?.cancel();
  return {
    status: res.status,
    latency_ms,
    location: res.headers.get('location') ?? undefined,
  };
}

async function collectDns(): Promise<Snapshot['dns']> {
  let apex_a_records: string[] = [];
  let apex_aaaa_records: string[] = [];
  try {
    apex_a_records = await dns.resolve4(LEGACY_APEX);
  } catch {
    // Apex may be CNAME-only or IPv6-only; treat as informational.
  }
  try {
    apex_aaaa_records = await dns.resolve6(LEGACY_APEX);
  } catch {}
  return { apex_a_records, apex_aaaa_records };
}

async function snapshotUser(email: string): Promise<UserSnapshot | { error: string }> {
  const db = getDb();
  const userRows = (await db.execute(sql`
    SELECT id FROM users WHERE lower(email) = ${email} LIMIT 1
  `)) as unknown as { id: string }[];
  if (userRows.length === 0) return { error: `no users row for ${email}` };
  const user_id = userRows[0].id;

  type CountRow = { c: number };
  const cast = (r: unknown) => Number((r as CountRow[])[0]?.c ?? 0);

  const [profRows, itemRows, outfitRows, tryOnRows, chatRows] = await Promise.all([
    db.execute(sql`
      SELECT EXISTS(SELECT 1 FROM style_profiles WHERE user_id = ${user_id}) AS has
    `),
    db.execute(sql`SELECT count(*)::int AS c FROM closet_items WHERE user_id = ${user_id}`),
    db.execute(sql`SELECT count(*)::int AS c FROM outfits WHERE user_id = ${user_id}`),
    db.execute(
      sql`SELECT count(*)::int AS c FROM try_on_jobs WHERE user_id = ${user_id} AND status = 'complete'`,
    ),
    db.execute(sql`
      SELECT count(*)::int AS c FROM chat_messages cm
      JOIN chat_conversations cc ON cm.conversation_id = cc.id
      WHERE cc.user_id = ${user_id}
    `),
  ]);

  const has_style_profile = Boolean(
    ((profRows as unknown as { has: boolean }[])[0] ?? { has: false }).has,
  );

  // Spot-check 5 random closet_items signed URLs
  type SigRow = { storage_path: string };
  const sigRows = (await db.execute(sql`
    SELECT storage_path FROM item_photos
    WHERE user_id = ${user_id} AND storage_path IS NOT NULL
    ORDER BY random()
    LIMIT 5
  `)) as unknown as SigRow[];

  const supabase = getSupabaseAdmin();
  let signed_urls_ok = 0;
  for (const row of sigRows) {
    const { data, error } = await supabase.storage
      .from(ITEM_PHOTOS_BUCKET)
      .createSignedUrl(row.storage_path, 60);
    if (error || !data?.signedUrl) continue;
    try {
      const res = await fetch(data.signedUrl, { method: 'HEAD' });
      if (res.status >= 200 && res.status < 300) signed_urls_ok++;
    } catch {}
  }

  return {
    user_id,
    has_style_profile,
    closet_items: cast(itemRows),
    outfits: cast(outfitRows),
    try_ons_complete: cast(tryOnRows),
    chat_messages: cast(chatRows),
    signed_urls_checked: sigRows.length,
    signed_urls_ok,
  };
}

// ─── Drift comparison ─────────────────────────────────────────────────────────

interface Drift {
  path: string;
  baseline: unknown;
  current: unknown;
}

function compareSnapshots(baseline: Snapshot, current: Snapshot): Drift[] {
  const drifts: Drift[] = [];

  if (baseline.dns.apex_a_records.join(',') !== current.dns.apex_a_records.join(',')) {
    drifts.push({
      path: 'dns.apex_a_records',
      baseline: baseline.dns.apex_a_records,
      current: current.dns.apex_a_records,
    });
  }

  for (const email of Object.keys(baseline.users)) {
    const b = baseline.users[email];
    const c = current.users[email];
    if (!c) {
      drifts.push({ path: `users.${email}`, baseline: b, current: 'missing in current' });
      continue;
    }
    const fields: (keyof UserSnapshot)[] = [
      'has_style_profile',
      'closet_items',
      'outfits',
      'try_ons_complete',
      'chat_messages',
    ];
    for (const f of fields) {
      if (b[f] !== c[f]) {
        drifts.push({ path: `users.${email}.${f}`, baseline: b[f], current: c[f] });
      }
    }
  }

  return drifts;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const emails = args.emails.length > 0 ? args.emails : DEFAULT_EMAILS;

  console.log(`\n══ Cutover preflight ══`);
  console.log(`  timestamp:  ${new Date().toISOString()}`);
  console.log(`  users:      ${emails.length}`);
  console.log(`  mode:       ${args.out ? 'baseline' : args.diff ? 'diff' : 'inspect'}`);
  console.log();

  const snapshot: Snapshot = {
    timestamp: new Date().toISOString(),
    dns: { apex_a_records: [], apex_aaaa_records: [] },
    railway: {
      tela_web_health: { status: 0, latency_ms: 0 },
      tela_api_health: { status: 0, latency_ms: 0 },
      tela_web_landing: { status: 0 },
    },
    users: {},
    failures: [],
  };

  // 1) DNS
  console.log('— DNS ' + '─'.repeat(40));
  snapshot.dns = await collectDns();
  console.log(`  ${LEGACY_APEX} A:     ${snapshot.dns.apex_a_records.join(', ') || '(none)'}`);
  console.log(`  ${LEGACY_APEX} AAAA:  ${snapshot.dns.apex_aaaa_records.join(', ') || '(none)'}`);

  // 2) Railway endpoints
  console.log('— Railway ' + '─'.repeat(36));
  try {
    snapshot.railway.tela_web_health = await fetchEndpoint(`${RAILWAY_WEB}/api/health`);
  } catch (err) {
    snapshot.failures.push(`tela-web /api/health: ${(err as Error).message}`);
  }
  try {
    snapshot.railway.tela_api_health = await fetchEndpoint(`${RAILWAY_API}/health`);
  } catch (err) {
    snapshot.failures.push(`tela /health: ${(err as Error).message}`);
  }
  try {
    snapshot.railway.tela_web_landing = await fetchEndpoint(`${RAILWAY_WEB}/`);
  } catch (err) {
    snapshot.failures.push(`tela-web /: ${(err as Error).message}`);
  }
  const ok = (s: number) => (s >= 200 && s < 400 ? '✓' : '✗');
  console.log(
    `  ${ok(snapshot.railway.tela_web_health.status)} tela-web /api/health   ${snapshot.railway.tela_web_health.status}  ${snapshot.railway.tela_web_health.latency_ms}ms`,
  );
  console.log(
    `  ${ok(snapshot.railway.tela_api_health.status)} tela /health           ${snapshot.railway.tela_api_health.status}  ${snapshot.railway.tela_api_health.latency_ms}ms`,
  );
  console.log(
    `  ${ok(snapshot.railway.tela_web_landing.status)} tela-web /             ${snapshot.railway.tela_web_landing.status}  → ${snapshot.railway.tela_web_landing.location ?? '(no Location header)'}`,
  );

  if (snapshot.railway.tela_web_health.status !== 200) {
    snapshot.failures.push(`tela-web /api/health returned ${snapshot.railway.tela_web_health.status}`);
  }
  if (snapshot.railway.tela_api_health.status !== 200) {
    snapshot.failures.push(`tela /health returned ${snapshot.railway.tela_api_health.status}`);
  }
  if (snapshot.railway.tela_web_landing.status !== 307) {
    snapshot.failures.push(
      `tela-web / returned ${snapshot.railway.tela_web_landing.status} (expected 307 redirect to /<locale>)`,
    );
  }

  // 3) Users
  console.log('— Users ' + '─'.repeat(38));
  for (const email of emails) {
    const res = await snapshotUser(email);
    if ('error' in res) {
      console.log(`  ✗ ${email}: ${res.error}`);
      snapshot.failures.push(`${email}: ${res.error}`);
      continue;
    }
    snapshot.users[email] = res;
    const sp = res.has_style_profile ? '✓' : '✗';
    const sig = res.signed_urls_ok === res.signed_urls_checked ? '✓' : '✗';
    console.log(
      `  ${sp} ${email}  items=${res.closet_items} outfits=${res.outfits} try-ons=${res.try_ons_complete} chat=${res.chat_messages} sigURL=${res.signed_urls_ok}/${res.signed_urls_checked} ${sig}`,
    );
    if (!res.has_style_profile) {
      snapshot.failures.push(`${email}: no style_profile (would hit lazy-init on first Generate)`);
    }
    if (res.signed_urls_checked > 0 && res.signed_urls_ok < res.signed_urls_checked) {
      snapshot.failures.push(
        `${email}: ${res.signed_urls_ok}/${res.signed_urls_checked} signed URLs reachable`,
      );
    }
  }

  // 4) Output / drift
  let driftCount = 0;
  if (args.diff) {
    const baselineRaw = await readFile(args.diff, 'utf8');
    const baseline = JSON.parse(baselineRaw) as Snapshot;
    const drifts = compareSnapshots(baseline, snapshot);
    driftCount = drifts.length;
    console.log('\n— Drift vs. ' + args.diff + ' ' + '─'.repeat(20));
    if (drifts.length === 0) {
      console.log('  ✓ no drift');
    } else {
      for (const d of drifts) {
        console.log(`  ✗ ${d.path}: ${JSON.stringify(d.baseline)} → ${JSON.stringify(d.current)}`);
      }
    }
  }

  if (args.out) {
    await writeFile(args.out, JSON.stringify(snapshot, null, 2) + '\n');
    console.log(`\n  ✓ wrote ${args.out}`);
  }

  // 5) Summary
  console.log('\n— Summary ' + '─'.repeat(36));
  if (snapshot.failures.length === 0 && driftCount === 0) {
    console.log(`  ✓ PASS — preflight clean`);
    await closeDb();
    process.exit(0);
  } else {
    if (snapshot.failures.length > 0) {
      console.log(`  ✗ FAIL — ${snapshot.failures.length} check failure(s):`);
      for (const f of snapshot.failures) console.log(`    - ${f}`);
    }
    if (driftCount > 0) {
      console.log(`  ✗ FAIL — ${driftCount} drift(s) from baseline`);
    }
    await closeDb();
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
