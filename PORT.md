# Visual Port — handoff document

This document is the **in-repo source of truth** for the visual port of
the legacy Tela app (`/Users/lukegorski/ale`) onto this new monorepo
(`/Users/lukegorski/tela`).

If you're a new Claude session resuming this work, **read this entire
document before writing any code.** Then read
`~/.claude/plans/visual-port.md` for per-screen blueprints.

---

## Why we're doing this port

The new architecture exists to fix things that were structurally wrong
in the legacy app:

1. **Firestore → Postgres** — relational integrity, real queries, cheaper
   at scale.
2. **Ad-hoc Next.js API routes → capability layer** — composable, type-safe
   end-to-end, exposable via tRPC + MCP, testable in isolation.
3. **Inline OpenAI calls scattered through API routes → AI gateway** —
   every call has provenance (which prompt version, which model, what
   cost, what input snapshot); enables eval harness + cost dashboard.
4. **Hardcoded prompts + knowledge → DB-backed `prompts` table +
   `stylist_rules` + `annotated_examples`** — cofounder iterates without
   engineering.
5. **Style DNA from onboarding quiz → closet read from actual wardrobe
   contents** — more accurate, reflects what the user actually owns.
6. **12 hardcoded chat tools → capability-as-tool auto-discovery** —
   every new capability is automatically a chat tool.
7. **Firebase-backed admin → proper admin tooling** (rules editor, prompt
   versioning, cost dashboard, user introspection). The whole point of
   building the capability layer was to enable this.

What this means for the port:

- **User-facing UI** (everything a normal user sees) → pixel-perfect
  port from the legacy app. The legacy code is the spec.
- **Backend / data layer** → new (Supabase + capabilities). Already
  built.
- **AI layer** → new (gateway, prompt versioning, eval). Already built.
- **Admin tooling** → new (we are explicitly REPLACING the legacy
  admin). Already built — keep mine, don't port legacy admin.
- **Conceptual model differences** (Style DNA → closet read) → the new
  model wins underneath unchanged UI.

---

## The golden no-residue rule

When the port is done, `/Users/lukegorski/ale` must be **completely
deletable** with **zero residue** in this repo. To make that real:

| Forbidden in `apps/web/` | Required instead |
|---|---|
| `import * from 'firebase/*'` (any firebase package) | Supabase + tRPC clients directly |
| `apps/web/src/app/api/wardrobe/*`, `/outfits/*`, `/chat`, `/translate`, `/auth/welcome-email`, `/admin/*` route handlers | tRPC capability calls |
| Firestore-shaped responses (nested `wardrobeItem.analysis.category`) | Our flat shapes (`closetItem.category`) |
| Firestore `Timestamp` types in component props | `Date` or ISO `string` |
| Firebase shim layer that mimics `getFirebaseAuth().currentUser.uid` | `useAuthContext().user.id` directly |
| Legacy `/sign-in` route | Landing page IS the login (no separate route) |
| `wardrobeItem.imageURL` containing a Firebase Storage download token | Supabase Storage signed URLs |

The only `/api/*`-shaped routes allowed in the new app are
**architecturally new** ones:
- `/auth/callback/route.ts` — required by Supabase OAuth
- `/auth/sign-out/route.ts` — sign-out POST handler
- `/chat/stream` — SSE endpoint for streaming chat (we built this; the
  legacy NDJSON is gone)
- `/trpc/*` — the tRPC router

Anything else is residue.

---

## Per-screen porting recipe

For each screen still on my MVP version:

### 1. Read the legacy file completely
Don't skim. The legacy code is the visual spec. Note every:
- Tailwind class
- Animation
- Conditional render
- State machine
- Sub-component

### 2. Identify dependencies
List every component, hook, lib helper, and Firebase touchpoint the
legacy file imports. Each one needs a port (or a stub if a feature is
deferred).

### 3. Identify data-shape gaps
Cross-reference what the legacy code reads (e.g.,
`item.analysis.category`, `item.bgColors.tl`) vs. what our schema
exposes (e.g., `closet_items.category`, `closet_items.background_color`).
Flag any field that legacy needs but our schema doesn't have. Either:
- Add the field to schema + capability output, or
- Defer the feature with a small UI accommodation (often legacy already
  handles missing fields gracefully).

### 4. Decide on data-fetch capability
If the legacy hook does a Firestore query that returns a richer shape
than our existing capability returns, you have three options:
- **Extend the existing capability** (simplest; broad impact if other
  callers exist; e.g., the chat tool catalog sees more fields).
- **Add a new capability** (e.g., `wardrobe.listForGrid`) that returns
  the rich shape needed for one screen. Keep the existing one for chat
  tools where lighter is better.
- **Use direct Postgres in a server-side `lib/*` helper** if the screen
  is already an RSC and never needs to refetch client-side.

For client-side screens that need to refetch after mutations
(wardrobe upload, etc.), tRPC capability is the right answer.

### 5. Port the file
- Copy the JSX **byte-for-byte** from the legacy file. Same Tailwind
  classes, same conditionals, same SVG paths, same animations.
- Replace data-layer imports:
  - `import { ... } from "firebase/firestore"` → remove
  - `import { getDb, getFirebaseAuth } from "@/lib/firebase"` → remove
  - Replace with `import { trpc } from "@/trpc/client"` for client
    components, or our `lib/*` server helpers for RSC.
- Replace data-layer calls:
  - `getFirebaseAuth().currentUser` → `useAuthContext().user`
  - `user.uid` → `user.id`
  - `user.photoURL` → `user.avatarUrl`
  - `user.getIdToken()` → `supabase.auth.getSession()` access token if
    you need a token (rarely needed; tRPC client attaches it
    automatically)
  - `doc(getDb(), ...)` + `updateDoc/setDoc/deleteDoc` →
    `trpc.capability.execute.useMutation()` with `{ name: 'X', input: {...} }`
  - `onSnapshot(...)` → polling, or Supabase Realtime, or
    refetch-on-event. Polling is acceptable as a starting point.
  - `firebase/storage` upload → existing
    `wardrobe.requestPhotoUpload` → direct Supabase Storage signed URL
    upload → `wardrobe.confirmPhotoUpload` flow.
  - `Timestamp.toDate()` → `new Date(item.createdAt)` (assuming
    capability returns ISO strings)
- Edit data accessors where data shape differs:
  - `item.analysis.category` → `item.category` (we use flat shape;
    edit the access pattern)

### 6. Replace MVP version
- Delete the corresponding `apps/web/src/components/<feature>/*` MVP
  components.
- Replace `apps/web/src/app/(main)/[lang]/<screen>/page.tsx` with the
  ported version.
- Run `pnpm --filter @tela/web typecheck` to catch any breakage.

### 7. Commit with descriptive message
The commit message should:
- Reference which legacy file was ported
- Call out every data-layer swap (so future engineers see what
  changed)
- Note any deferred features (e.g., "translations field empty until
  translation.translateLocale capability lands")

### 8. Push only with explicit approval
Per Luke's standing memory rule. Push commits one phase at a time so
he can test and roll back if needed.

---

## Status table

| Surface | Status | Files |
|---|---|---|
| `globals.css` | ✅ Ported | `apps/web/src/app/globals.css` |
| Public assets (login carousel, model images, spinners, logos) | ✅ Ported | `apps/web/public/*` |
| `useAuth` hook (Supabase-backed, same external shape as Firebase) | ✅ Ported | `apps/web/src/hooks/useAuth.ts` |
| `AuthProvider` | ✅ Ported | `apps/web/src/components/AuthProvider.tsx` |
| `DictionaryProvider` (with `translating` flag — translation hook stubbed) | ✅ Ported | `apps/web/src/components/DictionaryProvider.tsx` |
| `ThemeProvider` | ✅ Ported | `apps/web/src/components/ThemeProvider.tsx` |
| `PageTransitionProvider` | ✅ Ported | `apps/web/src/components/PageTransitionProvider.tsx` |
| `ProtectedRoute` | ✅ Ported | `apps/web/src/components/ProtectedRoute.tsx` |
| `ColorSwatch`, `LoadingSpinner`, `BottomSheet` | ✅ Ported | `apps/web/src/components/{ColorSwatch,LoadingSpinner,BottomSheet}.tsx` |
| `WeatherIcon` (extracted) | ✅ Ported | `apps/web/src/components/WeatherIcon.tsx` |
| `weather.ts` (uses public Open-Meteo APIs) | ✅ Ported | `apps/web/src/lib/weather.ts` |
| `colors.ts` | ✅ Ported | `apps/web/src/lib/colors.ts` |
| `i18n.ts` (`t` helper, LANGUAGE_NAMES, LANGUAGE_ENGLISH_NAMES) | ✅ Ported | `apps/web/src/lib/i18n.ts` |
| `useScrollPersistence` | ✅ Ported | `apps/web/src/hooks/useScrollPersistence.ts` |
| Landing page (carousel + mobile/desktop split) | ✅ Ported | `apps/web/src/app/(main)/[lang]/page.tsx` |
| Onboarding page + `OnboardingForm` (4-step incl. wardrobe gaps) | ✅ Ported | `apps/web/src/app/(main)/[lang]/onboarding/page.tsx`, `apps/web/src/components/OnboardingForm.tsx` |
| Navbar (desktop) | ✅ Ported | `apps/web/src/components/Navbar.tsx` |
| MobileNav (mobile bottom tabs) | ✅ Ported | `apps/web/src/components/MobileNav.tsx` |
| Settings panel (`SettingsMenu`, Theme/Language/Location/TryOn content) | ✅ Ported | `apps/web/src/components/{SettingsMenu,ThemeSettingsContent,LanguageSettingsContent,LocationSettingsContent,TryOnSettingsContent}.tsx`, `apps/web/src/components/LanguageSwitcher.tsx` |
| 4 settings sub-pages | ✅ Ported | `apps/web/src/app/(main)/[lang]/settings/{,location,language,try-on,theme}/page.tsx` |
| **Wardrobe page + `WardrobeItemCard` + `ItemDetailContent` + `ColorFilterChips` + `useWardrobe` hook** | ❌ MVP — needs port (D.6) | Legacy: `src/app/(main)/[lang]/wardrobe/page.tsx`, `src/components/{WardrobeItemCard,ItemDetailContent,ColorFilterChips}.tsx`, `src/hooks/useWardrobe.ts` |
| **Outfits page + `OutfitCard` + `OutfitHero` + `OutfitPiecesSheet` + `OutfitGridCell` + `useOutfits`** | ❌ MVP — needs port (D.7) | Legacy: `src/app/(main)/[lang]/outfits/page.tsx`, `src/components/Outfit*.tsx`, `src/hooks/useOutfits.ts` (if exists) |
| Outfit detail page | ❌ MVP — needs port (D.7) | Legacy: `src/app/(main)/[lang]/outfits/[id]/page.tsx` |
| **Lookbook page** (saved outfits) | ❌ Doesn't exist yet (D.8) | Legacy: `src/app/(main)/[lang]/lookbook/page.tsx` |
| **Chat page + `ChatComposer` + `ChatMessage` + `ChatItemGrid` + `ChatOutfitGrid` + `ChatWardrobePicker` + `useChat`** | ❌ MVP — needs port (D.9). Switch from legacy NDJSON to our SSE endpoint. | Legacy: `src/app/(main)/[lang]/chat/page.tsx`, `src/components/Chat*.tsx`, `src/hooks/useChat.ts` |
| **Dashboard page** | ❌ Doesn't exist yet (D.10) | Legacy: `src/app/(main)/[lang]/dashboard/page.tsx` |
| Wardrobe item detail | (legacy renders inline via `BottomSheet`, no separate page) | `apps/web/src/app/(main)/[lang]/wardrobe/[itemId]/` — my MVP page should be deleted as part of D.6 |
| Outfit detail (separate page vs inline) | TBD — read legacy outfit detail behavior in D.7 | |

---

## Reference commits (good examples to mirror)

When porting a new screen, look at how these were done:

- **`73dfb0e` — Phase 8.5.1 (admin foundation)**: clean addition of new
  capabilities + schema migration + admin route group. Good example of
  the no-residue capability pattern.
- **`98ee9cd` — Phase 9.1 (chat tool dispatch)**: adding multi-turn +
  tool support to the AI gateway, then wiring chat capabilities through
  it. Good example of extending the AI layer cleanly.
- **`688b37f` — Phase 9.2 (SSE streaming)**: shows the pattern for a
  new server endpoint that's NOT a `/api/*` mirror — it's an
  architecturally new SSE endpoint.
- **`963d62c` — Phase D.3 (landing page port)**: literal copy of legacy
  landing with `useAuthContext` swap + `profile.styleDna` →
  `profile.hasStyleProfile` mapping. Good example of pixel-perfect
  port with conceptual replacement underneath.
- **`c647048` — Phase D.4 (chrome ports)**: ~10 components ported in
  one commit. Each one is a literal copy with `user.photoURL` →
  `user.avatarUrl` and Firestore writes → tRPC mutations. Good
  example of the per-component swap pattern.
- **`a4482de` — Phase D.5 (onboarding)**: shows the OnboardingForm
  port + the `user.completeOnboarding` capability swap, plus the
  decision to write `wardrobeGaps` to the relational
  `wardrobe_gaps` table instead of as a JSONB blob.

---

## Common pitfalls

1. **Adding firebase as a dependency to make a literal copy compile.**
   Don't. The whole point is no firebase package. Surgically edit
   imports + access patterns instead.

2. **Reimplementing legacy `/api/*` routes in the new app to avoid
   touching component fetch calls.** Don't. tRPC mutations replace
   `fetch('/api/...')` cleanly. Component changes are minor.

3. **Returning Firestore-shaped (nested) data from new capabilities to
   avoid touching component access patterns.** Don't. Our schema is
   flat; expose it as flat. Component access edits are small.

4. **Forgetting `'use client'`.** Most ported components have hooks
   (`useState`, `useEffect`, `useAuthContext`) so they need `'use
   client'`. RSCs only for server-rendered shells.

5. **Forgetting to delete the MVP version.** When you port a screen,
   delete the corresponding `apps/web/src/components/<feature>/*` MVP
   directory and any helper libs (`apps/web/src/lib/<feature>*.ts`
   server helpers that are now redundant).

6. **Skipping `pnpm --filter @tela/web typecheck`** before committing.
   Catches `user.uid` → `user.id` rename misses and import path
   issues.

7. **Touching code in `/Users/lukegorski/ale/`.** Don't. That repo is
   the visual reference, read-only.

---

## What goes in the next session prompt

Copy this verbatim to start a new session:

> Continuing the Tela visual port from `/Users/lukegorski/tela`. Read
> `PORT.md` first, then `~/.claude/plans/visual-port.md`. Resume at
> Phase D.6 (wardrobe). Legacy app at `/Users/lukegorski/ale` is the
> visual ground truth — every screen is a literal copy of the legacy
> JSX with the data layer swapped to our capabilities + Supabase.
> Hard rule: zero firebase imports, zero `/api/*` mirroring routes,
> no Firestore-shaped responses, no shims. Push only with explicit
> approval.
