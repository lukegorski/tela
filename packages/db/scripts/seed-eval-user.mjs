/**
 * Seed the system "eval user" used by the prompt evaluation harness.
 *
 * The eval runner needs a userId to attribute generations to (so they
 * appear in cost dashboards distinctly). We use a stable, well-known UUID
 * and create a corresponding users row with a sentinel email.
 *
 * Idempotent — safe to re-run.
 *
 * Run: doppler run -- node packages/db/scripts/seed-eval-user.mjs
 */
import postgres from 'postgres';

const EVAL_USER_ID = '00000000-0000-0000-0000-000000000001';
const EVAL_USER_EMAIL = 'system+eval@tela.test';

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

async function main() {
  const existing = await sql`SELECT id FROM users WHERE id = ${EVAL_USER_ID}`;

  if (existing.length > 0) {
    console.log(`Eval user already exists: ${EVAL_USER_ID}`);
    await sql.end();
    return;
  }

  await sql`
    INSERT INTO users (id, email, display_name, locale)
    VALUES (${EVAL_USER_ID}, ${EVAL_USER_EMAIL}, 'Eval Harness', 'en')
  `;
  console.log(`✓ Seeded eval user: ${EVAL_USER_ID} (${EVAL_USER_EMAIL})`);
  await sql.end();
}

main().catch(async (err) => {
  console.error('Failed:', err.message);
  await sql.end();
  process.exit(1);
});
