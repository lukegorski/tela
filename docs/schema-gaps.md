# Schema Gaps to Address During Phase 8

Surfaced via Firestore audit on 2026-04-23 (see plan `post-foundation-phase.md` for context).

These are fields the production Firestore-backed app uses that our Postgres schema doesn't yet have. We don't migrate all of these upfront — we add them as we hit each screen during Phase 8 to avoid over-design and to ensure each addition has a real consumer.

## Priority 1 — likely needed in first week of Phase 8

### users
- `onboardingComplete` (boolean) — needed for routing logic (sends user to onboarding vs main app)
- `preferences` JSONB — `{ styleKeywords, favoriteColors, avoidColors, formality, lifestyle }`. Used by the style-quiz onboarding screen.
- `bodyInfo` JSONB — `{ bodyType, height, fitPreference }`. Onboarding.
- `location` JSONB — `{ city, country, lat, lon, timezone, tempUnit }`. Used by `context.assemble` and weather.

### closet_items
- `originalImageURL` (varchar) and `originalImagePath` (varchar) — pre-enhancement reference. Likely already covered by `item_photos.storage_path` but might need explicit field on items.
- `bgColors` JSONB — per-corner colors `{ tl, tr, bl, br }`. Used for UI card-background gradients.
- `translations` JSONB — per-locale item descriptions.

### outfits
- `feedback` enum (up | down | null) — explicit per-outfit user feedback
- `occasion` (varchar) — denormalized from context for display + filtering
- `season` JSONB array — denormalized from context (since one outfit may span seasons)
- `itemSnapshots` JSONB — `Record<itemId, { category, subcategory, primaryColor, description }>`. Resilience pattern: preserves outfit display when items are deleted.
- `wardrobeAssessment` (text) — narrative analysis attached to a generated outfit set

## Priority 2 — needed in second week (chat / try-on)

### chat_messages (stub → real)
- `role` (varchar) — `'user' | 'assistant'`
- `content` (text)
- `toolCalls` JSONB — `Array<{ name, arguments, result }>`
- `attachments` JSONB — image URLs / wardrobe item refs
- `richCards` JSONB — structured cards for embedded outfits/items
- `createdAt` (timestamp, already in stub)

### outfits (try-on subset, deferred until Phase 10 but flagged)
- `tryOnImageURL` (varchar)
- `tryOnStatus` (varchar) — `'pending' | 'generating' | 'completed' | 'failed'`
- `tryOnStartedAt` (timestamp)
- `tryOnAsyncJobId` (varchar)
- `tryOnAsyncStep` (varchar)

## Priority 3 — nice-to-have, defer until requested

### users
- `tryOnSettings` JSONB — `{ background, model, selfPhotoURL }`. Defer until Phase 10.
- `wardrobeGaps` array — was a heuristic in the production app; we'll likely re-derive this from the closet read instead.

### outfits
- `itemImages` array — denormalization for performance. Not needed until we have a screen that's slow without it.

## Translations are everywhere

Both `closet_items` and `outfits` have `translations: Record<locale, T>` shapes. Pattern: store as JSONB, accept that querying-by-locale is application-side. If we need indexed access later, normalize to a `translations` table.

## Approach

Each Phase 8 screen lands with the schema additions it needs:
- **Onboarding screen** lands `users.onboardingComplete`, `users.preferences`, `users.bodyInfo`, `users.location`
- **Wardrobe item detail** lands `closet_items.translations`, `closet_items.bgColors`
- **Outfit detail** lands `outfits.feedback`, `outfits.occasion`, `outfits.season`, `outfits.itemSnapshots`
- **Chat MVP** fills out `chat_messages` and `chat_conversations` real columns

This keeps each migration small and tied to a concrete UI change.
