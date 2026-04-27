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

**Largest port to date.** The legacy `outfits/page.tsx` is 877 lines
with 3 grid modes, snap-y hero feed, swipe gestures, deep-linking,
filter + generate + pieces + model-picker BottomSheets, and inline
client-side try-on orchestration. Plus a separate `/outfits/[id]`
deep-link route. Plus 4 substantial components.

**Reasonable scope split** (the new session decides at a natural
break — not pre-decided):
- D.7a — schema + capability refactor (outfitShape.ts, async try-on
  refactor, fix the 5 latent bugs listed below).
- D.7b — frontend (page + 4 components + useOutfits + detail page +
  delete MVP).
- Or one D.7 commit if the scope feels manageable end-to-end.

### Legacy files (READ-ONLY visual + behavior spec)

- `src/app/(main)/[lang]/outfits/page.tsx`         (877 lines)
- `src/app/(main)/[lang]/outfits/[id]/page.tsx`    (76 lines)
- `src/components/OutfitCard.tsx`                  (198 lines)
- `src/components/OutfitGridCell.tsx`              (184 lines, memo'd)
- `src/components/OutfitHero.tsx`                  (223 lines, memo'd)
- `src/components/OutfitPiecesSheet.tsx`           (183 lines)
- `src/lib/outfits.ts`                             (17 lines — just `deleteOutfit`)
- `src/lib/types.ts:93` — the legacy `Outfit` interface

There is **no `useOutfits` hook in legacy** — queries are inline in
`page.tsx` via Firestore `onSnapshot`. The new app needs to build
`useOutfits` from scratch (mirror `useWardrobe` pattern from D.6).

### Reused from earlier ports (do NOT reinvent)

| Surface | Source |
|---|---|
| `BottomSheet`, `LoadingSpinner`, `ColorSwatch`, `ProtectedRoute`, `useAuthContext`, `useDictionary` | D.4 chrome |
| `ColorFilterChips` | D.6 wardrobe |
| `useScrollPersistence` | D.6 prep |
| `RichItem` shape pattern | D.6 (`wardrobe/itemShape.ts`) — mirror as `outfit/outfitShape.ts` |

### Latent bugs to fix in D.7 (discovered during prep audit)

These are bugs in the *current* new-app code (not in the legacy app)
that surface when wiring the legacy UI. Roll into D.7 scope:

1. **`outfit.save` emits the wrong event type when unsaving.**
   `packages/capabilities/src/outfit/saveOutfit.ts:38` logs
   `'outfit.deleted'` when `saved: false` — but the row isn't
   deleted, it's just unsaved. Misleads the inference layer. Fix:
   add `'outfit.unsaved'` (or similar) to the event taxonomy and
   emit that instead. Keep `'outfit.deleted'` strictly for
   row-destruction.

2. **`outfit.delete` leaks Supabase Storage objects.**
   `packages/capabilities/src/outfit/deleteOutfit.ts` deletes the
   row + relies on FK cascade for `outfit_items` and `try_on_jobs`,
   but does not delete the try-on result image objects from the
   `try-on-results` bucket. Legacy `lib/outfits.ts` does best-effort
   `deleteObject` for these. Fix: enumerate cascaded
   `try_on_jobs.result_storage_path` values, delete from Storage
   best-effort, then delete the outfit row. Wrap in a transaction
   (D.6 pattern).

3. **`tryon.generate` is synchronous-blocking.**
   `packages/capabilities/src/tryon/generate.ts` polls Fashn ~30–90s
   before returning. CANNOT be called from a tRPC button-click
   mutation — the client times out. Legacy UI fires-and-forgets and
   polls. Fix: refactor to enqueue via `@tela/queue` (pg-boss
   already in repo) and return `jobId` immediately. The pg-boss
   worker in apps/api executes the pipeline and updates the
   `try_on_jobs` row. Frontend polls `tryon.getStatus` every 2-3s
   while status='running'. (Layered top+bottom+outerwear pipelines
   stay deferred; same as today.)

4. **`tryon.generate` hardcodes a Firebase Storage model URL.**
   `generate.ts:50-51` defines
   `DEFAULT_MODEL_URL = 'https://firebasestorage.googleapis.com/.../woman.jpg'`.
   Wrong twice over: ignores `users.try_on_settings.model` (already
   added to schema), and is a Firebase URL on the new stack. Fix:
   read the user's settings, map `'model-woman' | 'model-man'` to
   Supabase-hosted model image URLs (port the model JPGs to
   Supabase Storage as part of D.7 if they're not there yet), and
   honor the user's choice. (`'self'` stays disabled — same as
   D.4 try-on settings.)

5. **`tryon.getStatus` doesn't return `model`.**
   Legacy `Outfit` has a `model?: string` field that the UI may
   surface. Add `model: string | null` to the output schema, sourced
   from `try_on_jobs.model_image_url`.

### Schema changes

Migration `0011_*.sql` adds to `outfits`:

| Column | Type | Notes |
|---|---|---|
| `feedback` | `varchar(10)` nullable | 'up' \| 'down' \| null |
| `saved_at` | `timestamp with timezone` nullable | when `saved` flipped to true |
| `name` | `varchar(120)` nullable | source TBD — see decision (2) below |
| `wardrobe_assessment` | `text` nullable | source TBD — see decision (2) below |

No new tables. No changes to `outfit_items` or `try_on_jobs`.

### New / changed capabilities

| Capability | Change |
|---|---|
| `outfit/outfitShape.ts` | NEW — `fetchRichOutfits({ userId, outfitId?, savedOnly?, limit, offset })`. Joins outfits → outfit_items → closet_items → item_photos (signed URLs) → try_on_jobs (latest, for status + resultUrl + asyncStep + model) → contexts (occasion, season). Returns `RichOutfit[]`. Mirror `wardrobe/itemShape.ts`. |
| `outfit.list` | Replace lightweight shape with `RichOutfit[]` from `fetchRichOutfits`. Keep `savedOnly` + pagination input. |
| `outfit.get` | Replace with `fetchRichOutfits({ outfitId })[0]`. Keep `outfit.viewed` event. |
| `outfit.save` | Update to also write `saved_at`. Fix event-type bug above. |
| `outfit.delete` | Add Supabase Storage cleanup (see bug #2 above). Wrap in a Drizzle transaction. |
| `outfit.setFeedback` | NEW — `{ outfitId, feedback: 'up' \| 'down' \| null }`. Idempotent. Emits `feedback.positive` / `feedback.negative` / `feedback.cleared` (event taxonomy may need an addition). |
| `tryon.generate` | Refactor to enqueue (pg-boss) + return `jobId` immediately. Read `users.try_on_settings.model` for model URL. |
| `tryon.getStatus` | Add `model` to output schema. |

Add to event taxonomy (`packages/events/src/types.ts`):
- `'outfit.unsaved'` — outfit was un-saved (saved → false), row still exists.
- (Confirm whether `feedback.cleared` already exists or needs adding.)

### Generate flow (frontend orchestration)

Legacy `/api/outfits/generate` was a single endpoint that built
context server-side. Our equivalent is **two tRPC calls from the
frontend, in sequence**:

```
context.assemble({ occasion })  →  { contextId }
outfit.generate({ contextId, count: 1 })  →  { outfits: [...] }
```

Don't add a wrapper capability. The two-step pattern is fine — it
exposes the assembled context to the UI for display + caching.

### Outfit detail surfacing

Port BOTH:
- **Inline `BottomSheet`** with `OutfitPiecesSheet` for grid taps
  in the list page (fast browsing).
- **Standalone `/outfits/[id]/page.tsx`** route (rename my MVP
  `/[outfitId]` → `/[id]` to match legacy URL pattern). Renders
  `OutfitCard` with `showDetail` prop. Used for deep links.

### Try-on UX (frontend)

- Three display states per outfit cell/hero: try-on image, item-grid
  fallback, "Try on" / "Retry" CTA overlay. Loading spinner overlay
  during `status='running'`.
- Polling: `tryon.getStatus({ outfitId })` every 2-3s while
  `status='running'`. Stop on `complete` | `failed`.
- Resume on page reload: list any outfits whose `try_on_jobs.status
  IN ('pending','running')` and resume polling. (Mirror legacy's
  resume-on-mount logic.)
- First-time model picker (if `!profile.onboardingComplete`):
  force-pick model-woman / model-man (self disabled "coming
  soon"), then write `users.try_on_settings` + flip
  `onboarding_complete = true` via `user.completeOnboarding` (or
  a new dedicated capability).

### Real-time / refresh strategy

- Outfits list: refetch on mutation success (generate / save /
  delete / setFeedback) via `utils.outfit.list.invalidate()`.
  Optimistic insert on generate (mirror legacy).
- Try-on status: polling (above).
- No Supabase Realtime in D.7 — defer to a later phase.

### UI behaviors that must not be dropped

- 3 grid modes (1=hero snap-y, 2-col, 3-col) persisted in
  `localStorage["outfits-grid-mode"]`.
- Touch swipe-back gesture (right-edge swipe).
- `?id=` deep-link → switch to hero, scroll to outfit.
- Suspense wrapper (required for `useSearchParams`).
- Filter sheet with dynamic occasion list (only occasions present
  in current outfits).
- Generate sheet (occasion picker, generates 1).
- Optimistic outfit insertion + "scroll to top" after generate.
- Resume in-flight try-on pipelines on page reload.
- Memoized `OutfitGridCell` and `OutfitHero` — keep memo signatures
  matching legacy.

### i18n keys

Add to all 14 dictionaries (`apps/web/src/dictionaries/*.json`).
The OnboardingForm port (commit `a4482de`) is the pattern. Keys
needed (from the 4 legacy components + page):
- `dict.outfits.{tryOn, retryTryOn, deleteOutfit, saveToLookbook,
  savedToLookbook, goodOutfit, notMyStyle, pieces,
  generateAnOutfit, generatePrompt, wardrobeEmpty,
  somethingWentWrong, outfitNotFound, category}`
- `dict.constants.{occasionOptions.*, seasonOptions.*, categories.*}`
  (likely already partly there from D.5 / D.6).
- `dict.onboarding.selectYourModel`
- `dict.settings.{modelWoman, modelMan, modelMe, comingSoon}`
- `dict.common.{all, back, save, cancel, delete}`

### Files to delete (in the same commit as the port)

- `apps/web/src/components/outfits/{DeleteOutfitButton,
  GenerateOutfitsButton, OutfitCard, SaveOutfitButton,
  TryOnButton}.tsx` (5 MVP components — completely replaced).
- `apps/web/src/app/(main)/[lang]/outfits/[outfitId]/page.tsx`
  (MVP detail page — replaced by `[id]/page.tsx` ported from
  legacy).
- `apps/web/src/lib/outfits.ts`, `apps/web/src/lib/outfit-detail.ts`
  (if they exist as server helpers — verify before deleting).

### Decisions Luke must make BEFORE coding starts

(These are surfaced upfront because they're load-bearing for the
schema + capability shape. Don't pick silently.)

1. **Async try-on refactor**: confirm the pg-boss enqueue pattern
   for `tryon.generate` (recommended). Alternative: split into
   `tryon.start` + `tryon.advance` and orchestrate from the
   frontend (closer to legacy structure but more client logic).

2. **`name` and `wardrobe_assessment` source**: who sets these?
   - `name`: AI at generation time (extend the
     `outfit.generate` prompt to return it)? User-editable? Or
     just compute fallback from first item category?
   - `wardrobe_assessment`: cofounder via admin (new admin UI)?
     AI at generation time? Skip for D.7 (column added but unused)?

3. **Item-delete resilience**: D.6 chose to cascade-delete outfits
   when their items go away. Legacy denormalized `itemImages` so
   outfits survive item deletes (lookbook = full historical
   record). Stick with D.6's cascade (recommended), or revisit?

4. **Outfit-detail dual surfacing**: confirm we port BOTH the
   inline BottomSheet AND the standalone `/outfits/[id]` route
   (recommended — fast browsing + shareable URLs).

### Admin intersection (light follow-up)

`packages/capabilities/src/admin/getUserDetail.ts:153–160` reads
outfits `(id, rationale, saved, createdAt)`. Won't break with the
new columns. Optional D.7 polish: surface `feedback`, `saved_at`,
`name` in the admin user-detail page. Not required for D.7 to
ship.

---

## Phase D.8 — Lookbook

**Small surface, real plumbing.** Legacy lookbook is 370 lines (less
than half of outfits' 877). All UI components reused unmodified from
D.7b — the work is one new page file + extending `useOutfits` with a
`savedOnly` mode + extending `outfit.list` with an `orderBy` arg.
Single commit, no a/b split needed.

### Legacy file (READ-ONLY visual + behavior spec)

- `src/app/(main)/[lang]/lookbook/page.tsx` (370 lines)

There is **no `useLookbook` hook in legacy** — queries are inline via
Firestore `onSnapshot` on `users/{uid}/outfits where saved == true
orderBy savedAt desc`.

### Reused from earlier ports — DO NOT MODIFY

| Surface | Source |
|---|---|
| `OutfitHero`, `OutfitGridCell`, `OutfitPiecesSheet` | D.7b |
| `BottomSheet`, `LoadingSpinner`, `ProtectedRoute`, `ColorFilterChips` | D.4 / D.6 |
| `useScrollPersistence`, `useWardrobe` | D.6 |
| `useAuthContext`, `useDictionary` | D.4 chrome |

If D.8 needs to edit any D.7b component to make it work in lookbook,
that's a design issue — STOP and surface to Luke. The components
were built reusable.

### New app MVP to delete

**None.** The lookbook route doesn't exist in tela yet — straight
greenfield. Just create `apps/web/src/app/(main)/[lang]/lookbook/page.tsx`.

### Capability extension — `outfit.list` gains `orderBy`

`packages/capabilities/src/outfit/listOutfits.ts` — add to the input
zod object:

```typescript
orderBy: z.enum(['createdAt', 'savedAt', 'wornAt']).default('createdAt'),
```

Pass through to `fetchRichOutfits`.

`packages/capabilities/src/outfit/outfitShape.ts:169` — current:

```typescript
.orderBy(desc(outfits.createdAt))
```

Replace with:

```typescript
.orderBy(desc(outfits[opts.orderBy ?? 'createdAt']))
```

`outfit.list` has `chatTool: true`, so the chat tool catalog will see
the new arg. Document in the capability's `description` string that
`'savedAt'` is most useful when paired with `savedOnly: true`. **No
auto-switching** — explicit `orderBy` arg, default `'createdAt'`. The
chat-tool surface stays clean; magic auto-coupling between input
fields would be confusing for an LLM consumer.

### Hook extension — `useOutfits` gains `savedOnly`

`apps/web/src/hooks/useOutfits.ts` is currently hardcoded to
`savedOnly: false` in two places (refetch ~line 63, polling tick
~line 105). Both must accept the new opt.

New signature:

```typescript
useOutfits(opts?: { savedOnly?: boolean })
```

Implementation:

```typescript
const { savedOnly = false } = opts ?? {};
// In every outfit.list call inside the hook:
input: {
  savedOnly,
  orderBy: savedOnly ? 'savedAt' : 'createdAt',
  limit: 100,        // bumped from 50; capability max
  offset: 0,
}
```

Lookbook calls `useOutfits({ savedOnly: true })`. Outfits page keeps
its current `useOutfits()` (no args; defaults to `savedOnly: false`,
`orderBy: 'createdAt'`).

**Pitfall #11 watch (subtle re-render variant):** `opts` is a fresh
object every render. Destructure `savedOnly` into a primitive at the
top of the hook BEFORE any `useEffect` / `useCallback` dep array
references it — otherwise the destructured object identity changes
every render and effects re-fire forever (same shape as the D.6
auth-loop bug). Pin it to a primitive first.

**`toggleSave` optimistic-removal in savedOnly mode:** when an outfit
is unsaved from inside the lookbook pieces sheet, it must DISAPPEAR
from the grid immediately, not after the next refetch. The hook's
existing optimistic `toggleSave` flips `saved` in local state. In
savedOnly mode, additionally filter the outfit out of the local list
when `saved` becomes `false`. Mirror the legacy lookbook line 168–179
behavior. Same pattern for `setFeedback` if cleared feedback ever
removes from the view (it doesn't currently — feedback is independent
of saved).

### What the legacy page does (don't drop any)

- 3 grid modes (1 = hero snap-y, 2-col DEFAULT, 3-col).
  `localStorage["lookbook-grid-mode"]` (NOT `outfits-grid-mode`).
- `useScrollPersistence("lookbook-scroll", ...)` (NOT
  `outfits-scroll`).
- Touch swipe-back-to-grid gesture (right-edge swipe).
- Color filter ONLY (no occasion filter — that's outfits-only).
- Pieces sheet on tap (uses `OutfitPiecesSheet` from D.7b).
- Desktop: 5-column grid, `h-[calc(100vh-10rem)]` cells.
- Mobile: snap-y feed in mode 1, 2/3-col grid in modes 2/3.
- Header: title + grid-toggle (mobile only) + filter buttons. **No
  plus / generate button** — lookbook doesn't generate.
- Sort: `savedAt DESC` (legacy uses Firestore `orderBy("savedAt",
  "desc")`).

### Empty state — TWO branches

Legacy line 330:

```jsx
{outfits.length > 0 ? dict.outfits.noMatchFilters
                    : dict.lookbook.noSavedOutfits}
```

- 0 saved + 0 filters → "no saved outfits"
- N saved + color filter applied + 0 matches → "no match filters"
- N saved + 0 filters → grid renders

Preserve both branches.

### i18n — ALREADY DONE, no work needed

`dict.lookbook` namespace already exists in all 14 dictionaries
(`apps/web/src/dictionaries/*.json`):

- `dict.lookbook.title` ("Lookbook")
- `dict.lookbook.noSavedOutfits` ("No saved outfits yet")
- `dict.lookbook.filterLookbook` ("Filter lookbook")

Plus `dict.outfits.noMatchFilters` is already there. **D.8 adds zero
dict keys.** The legacy app's dicts at
`/Users/lukegorski/ale/src/app/(main)/[lang]/dictionaries/` were
mirrored when the new app's dicts were ported — confirmed by reading
`apps/web/src/dictionaries/en.json` line 114.

### Nav — ALREADY WIRED, no work needed

- `MobileNav.tsx` line 71: `localePath(lang, "/lookbook")`
- `Navbar.tsx` line 61: same

Active-tab highlighting works via `pathname.startsWith`. Just
creating the page is enough — clicking the lookbook tab will route
there with the correct active state.

### Known limitations — call out in commit message, don't try to solve

1. **Cross-tab consistency.** Legacy used Firestore `onSnapshot`, so
   a save on /outfits in tab A appeared in /lookbook in tab B
   instantly. We don't have that. Without Realtime / cross-tab
   broadcast, tab B is stale until refetch. Defer to a Realtime
   phase that addresses this app-wide.
2. **`limit: 100` cap.** A user with >100 saved outfits sees only the
   100 most-recently-saved. The capability max is 100. Add infinite
   scroll later if user data shows lookbooks routinely exceed 100.

### Smoke-test data requirement

Lookbook needs at least one saved outfit to render meaningfully.
Before Luke smoke-tests on Railway, generate + save 1-2 outfits via
`/outfits`. Flag this in the "Push?" message so test data exists
before testing.

### Files to delete

**None.** No MVP lookbook in tela.

### Decisions to surface to Luke before coding

1. Confirm the `useOutfits` API change: `useOutfits(opts?: {
   savedOnly?: boolean })`, default `limit` bumped 50 → 100, internal
   `orderBy` derived from `savedOnly`.
2. Confirm the `outfit.list` capability change: add `orderBy` enum
   arg, default `'createdAt'`, document `savedAt`-with-`savedOnly`
   idiom in the description.
3. Confirm savedOnly-mode optimistic-removal in `toggleSave` (filter
   out of local list when `saved` becomes `false`).

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
