# Realtime Verification — Deferred to Phase 8

**Status:** RLS is enabled and verified working server-side. Realtime publication includes `closet_items`, `item_photos`, `outfits`, `style_profiles`. Realtime client subscriptions return 401 errors with our current minimal node-script test setup.

**What we tested:** Created Alice + Bob via Supabase Admin API, signed them in, called `realtime.setAuth(accessToken)` on a fresh `createClient()` instance, subscribed to `postgres_changes` with INSERT events on `closet_items`. Received the change-notification (proves the publication forwarding works) but with `errors: ["Error 401: Unauthorized"]` and empty `new` / `old`.

**Why this is OK to defer:**
- The 401 is at the Realtime auth handshake, not the RLS policy layer
- Server-side capabilities continue to work correctly (8/8 cross-user authz tests pass post-RLS)
- The frontend in Phase 8 will use the full Supabase Auth flow (`signInWithPassword`, `setSession`, browser-managed session storage), which is the supported auth path for Realtime — not the manual `setAuth(token)` approach our test script uses
- If Realtime turns out to be genuinely broken in browsers too, we have a clean fallback: poll `enhancement.getStatus` every 3-5s, or refetch on visibility change. Worse UX, no other downsides.

**What to verify in Phase 8:**
- [ ] Browser-side `supabase.from('closet_items').select().subscribe()` works for an authenticated user
- [ ] Bob's browser session does NOT receive Alice's row inserts (RLS filtering)
- [ ] Both INSERT and UPDATE events arrive (esp. UPDATE for enhancement_status changing pending → processing → complete)

**If verification fails in Phase 8:**
- Check whether the publishable key (`sb_publishable_*`) is supported by Realtime — may need to use the legacy `anon` JWT-format key for Realtime specifically
- Check Supabase dashboard → Database → Replication: confirm tables are toggled on
- Try `supabase.auth.setSession({ access_token, refresh_token })` instead of `realtime.setAuth()`

**RLS policies in place (verified):** 21 tables with RLS enabled, 20 SELECT policies. `public.app_user_id()` helper resolves JWT auth.uid() to canonical app users.id. See `packages/db/drizzle/0005_enable_rls.sql`.
