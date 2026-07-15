/**
 * Environment standup self-audit: asserts the target database matches the
 * production-equivalent state inventoried by the dev-split Phase 0 audit
 * (docs/dev-environment-split-plan.md). SQL-only, read-only, prints PASS/FAIL
 * per check, exits non-zero on any FAIL.
 *
 * Run: doppler run --project tela --config dev -- node packages/db/scripts/verify-standup.mjs
 */
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
let failures = 0;

function report(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

try {
  const ref = new URL(process.env.SUPABASE_URL ?? 'https://unknown.invalid').hostname.split('.')[0];
  console.log(`Target project ref: ${ref}\n`);

  const [mig] = await sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`;
  report('20 journaled migrations applied', mig.n === 20, `found ${mig.n}`);

  const tables = await sql`SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'`;
  report('24 public tables', tables.length === 24, `found ${tables.length}`);
  const noRls = tables.filter((t) => !t.rowsecurity).map((t) => t.tablename);
  report('RLS enabled on every public table', noRls.length === 0, noRls.join(',') || 'all enabled');

  const [pol] = await sql`SELECT count(*)::int AS n FROM pg_policies WHERE schemaname = 'public'`;
  report('20 RLS policies (manual_001 set)', pol.n === 20, `found ${pol.n}`);

  const [evt] = await sql`SELECT count(*)::int AS n FROM pg_event_trigger WHERE evtname = 'ensure_rls'`;
  report('ensure_rls event trigger present', evt.n === 1);

  const fns = await sql`SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname IN ('app_user_id', 'rls_auto_enable')`;
  report('app_user_id + rls_auto_enable functions', fns.length === 2, fns.map((f) => f.proname).join(','));

  const colGrant = await sql`SELECT column_name FROM information_schema.column_privileges
    WHERE table_schema = 'public' AND table_name = 'users' AND grantee = 'authenticated'
      AND privilege_type = 'SELECT' ORDER BY column_name`;
  const cols = colGrant.map((c) => c.column_name).join(',');
  report('users column grant (manual_002)', cols === 'auth_user_id,features,id', cols || 'none');

  const dml = await sql`SELECT count(*)::int AS n FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated', 'service_role')
      AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')`;
  report('client roles have zero table-level DML (manual_003)', dml.n === 0, `found ${dml.n} grants`);

  const buckets = await sql`SELECT name, public FROM storage.buckets ORDER BY name`;
  const bucketSig = buckets.map((b) => `${b.name}:${b.public ? 'pub' : 'priv'}`).join(' ');
  report(
    'buckets item-photos(priv) models(pub) try-on-results(priv)',
    bucketSig === 'item-photos:priv models:pub try-on-results:priv',
    bucketSig || 'none',
  );

  const [pub] = await sql`SELECT count(*)::int AS n FROM pg_publication_tables WHERE pubname = 'supabase_realtime'`;
  report('realtime publication has 4 tables', pub.n === 4, `found ${pub.n}`);

  const counts = {};
  for (const t of ['prompts', 'prompt_versions', 'stylist_rules', 'annotated_examples']) {
    const [r] = await sql.unsafe(`SELECT count(*)::int AS n FROM public."${t}"`);
    counts[t] = r.n;
  }
  report('prompts synced', counts.prompts >= 7 && counts.prompt_versions >= 7,
    `prompts=${counts.prompts} versions=${counts.prompt_versions}`);
  report('stylist content seeded', counts.stylist_rules > 0 && counts.annotated_examples > 0,
    `rules=${counts.stylist_rules} examples=${counts.annotated_examples}`);

  const [rl] = await sql`SELECT count(*)::int AS n FROM rate_limits WHERE user_id IS NULL`;
  report('4 default rate limits', rl.n === 4, `found ${rl.n}`);

  const [ev] = await sql`SELECT count(*)::int AS n FROM users WHERE id = '00000000-0000-0000-0000-000000000001'`;
  report('eval user seeded', ev.n === 1);

  console.log(failures === 0 ? '\n✅ standup verification PASSED' : `\n❌ ${failures} check(s) FAILED`);
} finally {
  await sql.end();
}
process.exit(failures === 0 ? 0 : 1);
