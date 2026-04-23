/**
 * Seed default rate limits.
 * Idempotent — safe to re-run; updates existing rows in place.
 *
 * Run: doppler run -- node packages/db/scripts/seed-rate-limits.mjs
 */
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

const DEFAULTS = [
  // Global default — applies to all users + all capabilities unless overridden
  {
    userId: null,
    capabilityName: null,
    dailyMaxCents: 200, // $2.00/day per user across all AI ops — generous for a single user, ceiling for runaways
    dailyMaxCalls: null,
    perCallMaxCents: 20, // 20¢ per call — catches a single runaway prompt
    description: 'Global default: $2/day per user, 20¢ per single AI call',
  },
  // Outfit generation specifically: more expensive per call (uses gpt-5.4 with stylist rules)
  {
    userId: null,
    capabilityName: 'outfit.generate',
    dailyMaxCents: 50,
    dailyMaxCalls: 30,
    perCallMaxCents: 5,
    description: 'outfit.generate per-user defaults',
  },
  // Closet read — runs gpt-5.4 + gpt-5.4-mini in sequence
  {
    userId: null,
    capabilityName: 'profile.closetRead',
    dailyMaxCents: 30,
    dailyMaxCalls: 5,
    perCallMaxCents: 10,
    description: 'profile.closetRead per-user defaults — limit how often users re-read',
  },
  // Enhancement — gpt-image-1.5 at ~5¢/image, can retry once
  {
    userId: null,
    capabilityName: 'enhancement.process',
    dailyMaxCents: 1000, // $10/day per user — enough for ~200 enhancements (or 100 with retries)
    dailyMaxCalls: 250,
    perCallMaxCents: 15, // covers a single enhancement + retry
    description: 'enhancement.process per-user defaults — generous for an initial wardrobe upload',
  },
];

async function main() {
  // Wipe existing defaults (idempotent re-seed)
  await sql`DELETE FROM rate_limits WHERE user_id IS NULL`;

  for (const limit of DEFAULTS) {
    await sql`
      INSERT INTO rate_limits (
        user_id, capability_name, daily_max_cents, daily_max_calls,
        per_call_max_cents, description
      ) VALUES (
        ${limit.userId}, ${limit.capabilityName}, ${limit.dailyMaxCents},
        ${limit.dailyMaxCalls}, ${limit.perCallMaxCents}, ${limit.description}
      )
    `;
    console.log(
      `✓ ${limit.capabilityName ?? '(global)'}: $${(limit.dailyMaxCents / 100).toFixed(2)}/day, ${limit.perCallMaxCents}¢/call max`,
    );
  }

  console.log(`\n✅ Seeded ${DEFAULTS.length} default rate limits.`);
  await sql.end();
}

main().catch(async (err) => {
  console.error('Failed:', err.message);
  await sql.end();
  process.exit(1);
});
