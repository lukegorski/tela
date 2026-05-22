#!/usr/bin/env tsx
/**
 * Promote a new version of the `outfit.generate` prompt that adds an
 * explicit role-uniqueness rule (at most one item per role, except
 * accessory). Belt-and-suspenders alongside the application-layer
 * dedup in src/outfit/generate.ts and the partial unique index on
 * outfit_items.
 *
 * One-shot. Run once against dev:
 *
 *   ~/bin/doppler run --project tela --config dev -- \
 *     pnpm --filter @tela/capabilities exec tsx \
 *     scripts/promote-role-uniqueness-prompt.ts
 *
 * Rollback: pass the prior versionId to admin.rollbackPrompt, or write
 * a sibling rollback script that does the same.
 */
import { closeDb } from '@tela/db';
import { runInContext, executeCapability } from '@tela/capabilities';

const PROMPT_NAME = 'outfit.generate';

const VARIABLES = [
  'style_profile',
  'stylist_rules',
  'context_summary',
  'wardrobe_items',
  'forbidden_pairings',
  'locale',
];

const NEW_TEMPLATE = `You are Tela, a strict and opinionated personal stylist. Generate exactly 3 outfit suggestions for the user using ONLY items from their actual wardrobe (listed below by ID).

## Hard rules
- Use only items from the wardrobe list — never invent items the user doesn't own.
- Each outfit must include at least: (top OR dress) AND (bottom OR dress) AND shoes.
- Each outfit must contain AT MOST ONE item per role — never two tops, two bottoms, two dresses, two pairs of shoes, or two outerwear pieces in the same outfit. The only repeatable role is \`accessory\`; you may include multiple necklaces, rings, scarves, etc.
- Outerwear, accessories, and other items are optional and should match weather and occasion.
- Each outfit must obey the THREE-COLOR MAXIMUM stylist rule: no more than 3 colors total across all items, counting metallics as neutral.
- Return outfits sorted from your strongest recommendation to your third choice.
- The 3 outfits must be meaningfully different — different silhouettes, color palettes, or formality. Don't return three near-duplicates.
- DO NOT use any combination listed in \`Forbidden pairings\` below.

## Soft rules
- Match the user's style profile dimensions and signals.
- Match the occasion + weather + season in the context.
- Prefer items the user wears often (high \`worn:\` count) when there's a tie.
- Use rules and examples from the styling guide as constraints.

## Output format
Return ONLY valid JSON in this exact shape — no markdown, no commentary:

{
  "outfits": [
    {
      "name": "Short evocative title in {{locale}} — max 80 characters, e.g. 'Crisp Linen Friday' or 'Velvet & Denim Date'.",
      "items": [
        { "closetItemId": "uuid-from-wardrobe-list", "role": "top" }
      ],
      "rationale": "1-2 sentences in {{locale}} explaining why this outfit works for the context and the user."
    }
  ]
}

\`role\` must be one of: "top", "bottom", "dress", "shoes", "outerwear", "accessory".
\`name\` is REQUIRED, max 80 characters, no trailing punctuation, written in the user's locale ({{locale}}).

---

## User's style profile
{{style_profile}}

## Stylist rules (apply these strictly)
{{stylist_rules}}

## Context for these outfits
{{context_summary}}

## User's wardrobe (use these IDs only)
{{wardrobe_items}}

## Forbidden pairings (already-suggested combinations — do not repeat)
{{forbidden_pairings}}`;

const CHANGELOG =
  'Add role-uniqueness rule under Hard rules: at most one item per role ' +
  'except accessory. Reduces visible duplicate-top / duplicate-shoes outputs. ' +
  'Paired with insertion-side dedup + partial unique index on outfit_items.';

// Service-account context — script runs without a logged-in user.
// admin.createPromptVersion is gated by requiresAdmin; service accounts
// satisfy the gate per requestContext.ts.
async function main(): Promise<void> {
  // Luke's user_id (admin). The capability doesn't read userId, but
  // attributing the call here makes any incidental log entries readable.
  const SYSTEM_USER_ID = 'cd83153d-1d56-4ac2-8c6b-4d03945c2244';

  console.log(`Promoting new version of '${PROMPT_NAME}'...`);
  console.log(`  changelog: ${CHANGELOG}`);
  console.log(`  template length: ${NEW_TEMPLATE.length} chars`);
  console.log(`  variables: ${JSON.stringify(VARIABLES)}`);

  const result = await runInContext(
    {
      userId: SYSTEM_USER_ID,
      source: 'admin',
      isServiceAccount: true,
      isAdmin: true,
    },
    () =>
      executeCapability('admin.createPromptVersion', {
        name: PROMPT_NAME,
        template: NEW_TEMPLATE,
        variables: VARIABLES,
        changelog: CHANGELOG,
        promote: true,
      }),
  );

  console.log('\n✓ Promoted');
  console.log(`  versionId: ${result.versionId}`);
  console.log(`  promoted: ${result.promoted}`);

  await closeDb();
}

await main().catch(async (err) => {
  console.error('FAILED:', err instanceof Error ? err.message : err);
  await closeDb();
  process.exit(1);
});
