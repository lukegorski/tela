/**
 * Seed stylist_rules and annotated_examples from the cofounder's styling guide.
 *
 * Source: /Users/lukegorski/ale/tela/tela_styling_guide_updated.md
 * Run: doppler run -- node packages/db/scripts/seed-stylist-content.mjs
 *
 * Idempotent: deletes existing rules + examples before inserting fresh content.
 * The version field on each rule increments on every reseed so we can track
 * which generation was used for which outfit.
 */
import { readFileSync } from 'node:fs';
import postgres from 'postgres';

const SOURCE = '/Users/lukegorski/ale/tela/tela_styling_guide_updated.md';
const sql = postgres(process.env.DATABASE_URL, { max: 1 });

function categorize(title) {
  const t = title.toLowerCase();
  if (t.includes('color')) return 'color';
  if (t.includes('jean') || t.includes('pants') || t.includes('skirt') || t.includes('dress'))
    return 'silhouette';
  if (t.includes('shoe') || t.includes('sock')) return 'footwear';
  if (t.includes('shirt') || t.includes('polo') || t.includes('t-shirt') || t.includes('collar'))
    return 'tops';
  if (t.includes('jumpsuit')) return 'silhouette';
  if (t.includes('layer') || t.includes('weight') || t.includes('bulk') || t.includes('texture'))
    return 'layering';
  if (t.includes('print') || t.includes('pattern')) return 'pattern';
  if (t.includes('accessor') || t.includes('proportion')) return 'accessories';
  if (t.includes('travel')) return 'context';
  if (t.includes('body type')) return 'fit';
  if (t.includes('formal') || t.includes('athleisure')) return 'context';
  return 'general';
}

function priorityFor(title) {
  // Core rules > specific category rules
  const t = title.toLowerCase();
  if (t.includes('core rule')) return 100;
  if (t.includes('color pairing')) return 80;
  if (t.includes('layering') || t.includes('proportion')) return 60;
  return 40;
}

function extractExamples(body) {
  const examples = [];
  const lines = body.split('\n');
  for (const line of lines) {
    const goodMatch = line.match(/^GOOD example:\s*(.+)$/i);
    const badMatch = line.match(/^BAD example:\s*(.+)$/i);
    if (goodMatch) examples.push({ kind: 'good', text: goodMatch[1].trim() });
    else if (badMatch) examples.push({ kind: 'bad', text: badMatch[1].trim() });
  }
  return examples;
}

async function main() {
  const raw = readFileSync(SOURCE, 'utf-8');

  // Split into sections by the === HEADER === delimiter
  const sections = [];
  const sectionRegex = /^=== (.+) ===$/gm;
  let match;
  const positions = [];
  while ((match = sectionRegex.exec(raw)) !== null) {
    positions.push({ title: match[1].trim(), start: match.index, headerEnd: match.index + match[0].length });
  }

  for (let i = 0; i < positions.length; i++) {
    const cur = positions[i];
    const next = positions[i + 1];
    const body = raw.slice(cur.headerEnd, next ? next.start : undefined).trim();
    sections.push({ title: cur.title, body });
  }

  // The text before the first === is the persona / preamble
  const preamble = raw.slice(0, positions[0]?.start).trim();
  if (preamble.length > 0) {
    sections.unshift({ title: 'STYLIST PERSONA', body: preamble });
  }

  console.log(`Parsed ${sections.length} sections from styling guide`);

  // Wipe existing rules + examples (idempotent reseed)
  await sql`DELETE FROM stylist_rules`;
  await sql`DELETE FROM annotated_examples`;
  console.log('Cleared existing stylist_rules and annotated_examples');

  let ruleCount = 0;
  let exampleCount = 0;

  for (const section of sections) {
    const category = categorize(section.title);
    const priority = priorityFor(section.title);

    await sql`
      INSERT INTO stylist_rules (category, rule, priority, active, version)
      VALUES (${category}, ${section.body}, ${priority}, true, 1)
    `;
    ruleCount++;

    const examples = extractExamples(section.body);
    for (const ex of examples) {
      const tags = [section.title.toLowerCase(), category, ex.kind];
      await sql`
        INSERT INTO annotated_examples (title, outfit_description, reasoning, context, tags)
        VALUES (
          ${section.title.slice(0, 100)},
          ${ex.text},
          ${ex.kind === 'good' ? 'Why it works (per stylist guide)' : 'Why it fails (per stylist guide)'},
          ${section.title},
          ${JSON.stringify(tags)}::jsonb
        )
      `;
      exampleCount++;
    }
  }

  console.log(`✅ Seeded ${ruleCount} stylist rules and ${exampleCount} annotated examples.`);
  await sql.end();
}

main().catch(async (err) => {
  console.error('Seed failed:', err.message);
  await sql.end();
  process.exit(1);
});
