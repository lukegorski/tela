# Visual Port Plan — per-screen blueprints

**Date drafted:** 2026-04-24
**Status:** Active
**In-repo companion:** `/Users/lukegorski/tela/PORT.md` (read first)
**Predecessor:** `/Users/lukegorski/.claude/plans/post-foundation-phase.md`

This file holds the detailed, per-screen execution plan for the
remaining visual ports. The in-repo `PORT.md` has the rules + status
table + recipe. This file has the depth.

---

## What's done (D.1 — D.5)

Pushed to `main`. Live on Railway. See `PORT.md` status table for
file locations.

- D.1 — DictionaryProvider port (with `translating` flag, file moved
  to `@/components/DictionaryProvider`).
- D.2 — `auth.whoami` extended with `hasStyleProfile` + full
  `location` object on `AuthProfile`.
- D.3 — Landing page (5-image carousel + mobile/desktop split + Google
  + email auth + Ken Burns zoom + crossfade).
- D.4 — Chrome: weather lib, `WeatherIcon`, `ThemeProvider`,
  `PageTransitionProvider`, `ProtectedRoute`, `ColorSwatch`,
  `LoadingSpinner`, `BottomSheet`, `ThemeSettingsContent`,
  `LanguageSwitcher`, `LanguageSettingsContent`, `SettingsMenu`,
  `LocationSettingsContent`, `TryOnSettingsContent`, `Navbar`,
  `MobileNav`, 4 settings sub-pages.
- D.5 — Onboarding 4-step quiz (style, body, lifestyle, wardrobe gaps).

Capabilities + schema added along the way:
- `users.try_on_settings` JSONB column (migration 0009).
- `user.updateTryOnSettings`, `user.getWardrobeGaps`.
- `user.completeOnboarding` extended to write `wardrobeGaps` rows to
  the `wardrobe_gaps` table.
- `auth.whoami` returns `tryOnSettings`, `location`,
  `hasStyleProfile`.
- `i18n.ts` adds `t()` template helper + `LANGUAGE_ENGLISH_NAMES`.
- `useScrollPersistence` ported (used by wardrobe + outfits grids).

---

## Phase D.6 — Wardrobe

**Legacy file:** `src/app/(main)/[lang]/wardrobe/page.tsx` (~700
lines).

### Dependencies to port

| Component / hook | Legacy file | Notes |
|---|---|---|
| `useWardrobe` hook | `src/hooks/useWardrobe.ts` | Replace Firestore subscription with tRPC + polling. Swap upload flow to our multi-step capability pipeline (`requestPhotoUpload` → Supabase Storage upload → `confirmPhotoUpload` → `item.analyze` → `wardrobe.addItem`). Swap delete to `wardrobe.removeItem`. |
| `WardrobeItemCard` | `src/components/WardrobeItemCard.tsx` (~200 lines) | Pixel-perfect port. Needs `item.bgColors`/`bgColor` (from enhanced photo corner sampling) — our schema has `closet_items.background_color` (single hex), not 4 corners. Decide: extend schema with corner colors, or use single bgColor for all 4 corners. Recommend single for MVP. Edit `enhancementStartedAt.toDate()` → `new Date(enhancementStartedAt)` (or use ISO string). |
| `ItemDetailContent` | `src/components/ItemDetailContent.tsx` (~158 lines) | Pixel-perfect port. Reads `item.analysis.translations[lang]` — leave empty until translation capability lands. Reads `item.analysis.material`, `item.analysis.style`, `item.analysis.pattern`, `item.analysis.season` — confirm all stored in schema. |
| `ColorFilterChips` | `src/components/ColorFilterChips.tsx` (~83 lines) | Pixel-perfect port. Reads `item.analysis.translations` (skip), `primaryColor`, `secondaryColor`. |
| `useScrollPersistence` | already ported | — |

### Data shape gaps to resolve

Cross-reference legacy `WardrobeItemAnalysis` vs `closet_items` schema:

| Legacy field | Our schema | Action |
|---|---|---|
| `category` | `category` | ✅ same |
| `subcategory` | `subcategory` | ✅ same |
| `primaryColor`, `secondaryColor` | same | ✅ same |
| `pattern` | `pattern` | ✅ same |
| `style` | `style` | ✅ same |
| `season: string[]` | `season_compatibility: jsonb` | ✅ same data, different column name |
| `formality: number` | `formality_score: real` | ✅ same data |
| `material: string` (free text) | `material_weight: enum('light','medium','heavy')` | ⚠️ different concept. Decide: add `material text` column, or repurpose `material_weight` in UI. **Recommend: add `material` column to `closet_items` + populate via `item.analyze` extension.** Defer if time-pressed; UI handles empty material gracefully. |
| `description` | `description` | ✅ same |
| `fit`, `length`, `sleeveLength` | same | ✅ same |
| `translations: Record<locale, ...>` | not in schema | Defer. Components read `?.[lang]` and fall back to English. |
| `bgColor`, `bgColors: {tl,tr,bl,br}` | `background_color text` (single) | Use single hex for all 4 corners; visual difference is subtle. Add corner colors later if cofounder notices. |
| `enhancementStatus`, `enhancementStartedAt` | `item_photos.enhancement_status`, `item_photos.enhanced_at` | Different table. Capability output should join. |
| `imageURL`, `imagePath`, `originalImageURL`, `originalImagePath` | derived from `item_photos.storage_path` (and `enhanced_storage_path`) via signed URLs | Capability output signs both URLs. |
| `analysisLocale` | `analysis_locale` | ✅ same |
| `createdAt: Timestamp` | `created_at: timestamp` | Use ISO string; components do `new Date(...)`. |

### Capability decision

**Recommendation: extend `wardrobe.listItems`** to return the rich
shape (signed URLs + all analysis fields + enhancement status). The
chat tool catalog will see more fields, which is harmless.

Alternative: add `wardrobe.listForGrid` as a sister capability if you
want to keep the chat-exposed `listItems` lean. Slight code
duplication, slight extra bytes for the chat tool description.

Either way, the capability output shape needs:
```typescript
{
  id, photoId, enhancedPhotoId,
  category, subcategory, primaryColor, secondaryColor, pattern, style,
  fit, length, sleeveLength, description,
  formalityScore, materialWeight, seasonCompatibility,
  wearCount, lastWornAt, createdAt,
  // Joined from item_photos:
  enhancementStatus, enhancementStartedAt, backgroundColor,
  // Computed:
  imageUrl: string, // signed URL — enhanced if ready, else original
  originalImageUrl: string, // signed URL for original
}
```

### Multi-step upload swap

Legacy `useWardrobe.uploadItem(file)`:
1. Upload to Firebase Storage at `users/{uid}/wardrobe/{uuid}.jpg`
2. `getDownloadURL()` to get public URL
3. POST `/api/wardrobe/analyze` with `{ imageURL, imagePath, lang }`
4. Server analyzes + writes Firestore doc

Our equivalent:
1. `wardrobe.requestPhotoUpload({ filename, mimeType })` → returns
   signed upload URL + storage path + token
2. Upload file to Supabase Storage with the signed URL
3. `wardrobe.confirmPhotoUpload({ storagePath })` → returns photoId,
   enqueues enhancement job
4. `item.analyze({ photoId, locale })` → AI analyzes
5. `wardrobe.addItem({ photoId, analysisResult })` → creates closet_items row

The hook should match legacy's `uploadItem(file): Promise<void>`
signature. Internally chains the 5 steps.

Refer to existing `apps/web/src/components/wardrobe/UploadButton.tsx`
(my MVP version) for a working example of the multi-step pipeline.

### Page port specifics

The page is huge but the structure is:
- Header (filter button, grid mode toggle, add button)
- Conditional: file preview/upload UI when files selected
- Else: scrollable grid of `WardrobeItemCard`s grouped by category
- Filter `BottomSheet`
- Item detail `BottomSheet` (uses `ItemDetailContent`)
- Full-screen image viewer

Port verbatim. The `selectedFiles` state machine for the upload
preview is intricate — copy it carefully.

### Files to delete after port

- `apps/web/src/app/(main)/[lang]/wardrobe/[itemId]/page.tsx` (legacy
  uses BottomSheet inline, no separate detail route)
- `apps/web/src/components/wardrobe/*` (UploadButton, WardrobeGrid,
  RemoveItemButton — all replaced by legacy components)
- `apps/web/src/lib/wardrobe.ts`, `apps/web/src/lib/wardrobe-item.ts`
  (server helpers no longer needed if page goes client-side via the
  hook)

---

## Phase D.7 — Outfits + outfit detail

**Legacy files:**
- `src/app/(main)/[lang]/outfits/page.tsx`
- `src/app/(main)/[lang]/outfits/[id]/page.tsx`

### Dependencies (read these first)

- `src/hooks/useOutfits.ts` (if exists, else queries inline)
- `src/components/OutfitCard.tsx`
- `src/components/OutfitHero.tsx`
- `src/components/OutfitGridCell.tsx`
- `src/components/OutfitPiecesSheet.tsx`
- `src/lib/outfits.ts`

### Capability decisions

Likely need:
- Extend `outfit.list` or add `outfit.listForGrid` returning items with
  signed image URLs + try-on status + saved status.
- `outfit.feedback({ outfitId, feedback: 'up' | 'down' })` — new
  capability if not already present (legacy stores per-outfit
  thumbs-up/down).

### Try-on integration

Outfit detail shows try-on result inline (legacy uses `OutfitHero`
overlay). Our `tryon.generate` + `tryon.getStatus` capabilities
already exist (Phase 10 MVP). The frontend wiring in this phase is
swapping our `TryOnButton` MVP for the legacy hero overlay pattern.

### Data shape gaps

Legacy `Outfit` type:
- `items: string[]` (just IDs, denormalized via `itemImages`)
- `itemImages: string[]`
- `reasoning: string`
- `name?: string`
- `occasion: string`
- `season: string[]`
- `saved: boolean`
- `feedback: 'up' | 'down' | null`
- `tryOnImageURL`, `tryOnStatus`, `tryOnAsyncJobId`, `tryOnAsyncStep`
- `model?: string` (try-on model)
- `wardrobeAssessment?: string` (cofounder's commentary on the outfit)
- `translations`, `itemSnapshots`

Our schema has:
- `outfits.id, user_id, generation_id, context_id, rationale,
  pairing_key, embedding, saved, worn_at, created_at`
- `outfit_items.outfit_id, closet_item_id, role`
- Plus `try_on_jobs` for try-on state

Gaps:
- `feedback`: not in schema. Add `outfits.feedback` column (enum/varchar),
  add `outfit.setFeedback` capability.
- `name`: not in schema. Add `outfits.name varchar(120)` (nullable) or
  just compute from items.
- `wardrobeAssessment`: not in schema. Add column or skip the UI bit.
- `season`: outfits don't have seasons in our schema (context does).
  Skip; UI accommodates empty.
- `tryOn*` fields: come from `try_on_jobs` join.

### Files to delete after port

- `apps/web/src/components/outfits/*` (my MVP cards, buttons,
  TryOnButton)
- `apps/web/src/lib/outfits.ts`, `apps/web/src/lib/outfit-detail.ts`
  (server helpers redundant)

---

## Phase D.8 — Lookbook

**Legacy file:** `src/app/(main)/[lang]/lookbook/page.tsx`

Smaller — likely reuses `OutfitCard` from outfits port. Filtered to
`saved=true` only. Uses our existing `outfit.list({ savedOnly: true })`.

Port after D.7 since it shares components.

---

## Phase D.9 — Chat (and switch to our SSE endpoint)

**Legacy files:**
- `src/app/(main)/[lang]/chat/page.tsx`
- `src/components/ChatComposer.tsx`
- `src/components/ChatMessage.tsx`
- `src/components/ChatItemGrid.tsx`
- `src/components/ChatOutfitGrid.tsx`
- `src/components/ChatWardrobePicker.tsx`
- `src/hooks/useChat.ts`

### Streaming swap

Legacy: NDJSON over POST `/api/chat`.
Ours: SSE at POST `/chat/stream` (already built — see `apps/api/src/chatStream.ts`).

Already have a partial port at
`apps/web/src/components/chat/ChatComposer.tsx` (my MVP) that consumes
SSE. That logic is reusable; the rest of the chat ecosystem
(`ChatMessage`, `ChatItemGrid`, `ChatOutfitGrid`,
`ChatWardrobePicker`) needs porting.

### Tool dispatch differences

Legacy chat had 12 hardcoded tools. Our chat does
capability-as-tool auto-discovery (`chatTool: true` opt-in flag).
Tools the model can call:
- wardrobe.listItems, wardrobe.getItem, wardrobe.removeItem
- outfit.generate, outfit.list, outfit.get, outfit.save, outfit.delete
- profile.get, profile.closetRead
- context.assemble

The chat UI's tool-invocation badges should render the same way
legacy does (small inline status messages); see existing
`ChatComposer` MVP for the pattern.

### Attachment upload

Legacy supports image attachments in chat. Need to port the
attachment flow (upload to Storage → reference in message →
AI vision processes). Our `wardrobe.requestPhotoUpload` flow can be
reused with a different bucket prefix.

### Files to delete after port

- `apps/web/src/components/chat/*` (my MVP ChatComposer)
- `apps/web/src/lib/chat.ts` (server helper for latest conversation)

---

## Phase D.10 — Dashboard

**Legacy file:** `src/app/(main)/[lang]/dashboard/page.tsx`

Smaller, likely a summary/landing for signed-in users. Read it fresh
and port. Probably 1-2 hours.

---

## Phase E — Cleanup

After D.6-D.10:

1. `grep -rn "firebase" apps/web/src` → must return zero matches
   (besides this file's mentions).
2. `ls apps/web/src/app/api/` → should only have legitimate
   architectural routes, no legacy mirrors.
3. Visual diff every screen against telastyle.app side-by-side.
4. Delete any remaining unused MVP components:
   - `apps/web/src/components/admin/*` — keep (those are my admin)
   - `apps/web/src/components/{wardrobe,outfits,onboarding,chat,nav,auth,icons}/*`
     — should all be deleted by then
   - `apps/web/src/lib/{wardrobe,outfits,outfit-detail,chat,wardrobe-item,profile}*` — server helpers; delete the ones the new client hooks superseded.
5. Delete this PORT.md if you want — or keep as historical reference.

---

## Capability work that's deferred (not blocking)

- `translation.translateLocale` — replaces `/api/translate`. Without
  it, items + outfits stay in their original locale when user
  switches languages. UI is graceful (falls back to English text).
- `auth.welcomeEmail` — replaces `/api/auth/welcome-email`. Needs
  `RESEND_API_KEY` in Doppler (already in legacy env, just needs
  copy). Without it, no welcome email on signup.
- `event.log` — replaces `/api/activity/log`. We already have
  `events` table + `logEvent` helper internally; client-side activity
  logging is deferred.
- Real-time updates — Supabase Realtime not wired. Polling +
  refetch-on-mutation is the current pattern. Acceptable for the small
  user base.

---

## After the port is done

- Phase 11 (data migration from Firebase) per the post-foundation
  plan — only opted-in users (Luke + cofounder + ~5 friends).
- Phase 12 (cutover) — point telastyle.app DNS at the new stack,
  decommission Firebase project after 30 days.
- Resume Phase 10 polish (layered try-on with outerwear, self-photo
  upload).
