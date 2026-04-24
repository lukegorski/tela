-- Phase 8 prep: Enable Row Level Security for client-side Supabase Realtime.
--
-- BACKGROUND
-- Until now, all DB access has been server-side via the Supabase service role
-- key, which bypasses RLS. The Phase 8 frontend will use Supabase Realtime
-- to subscribe to row changes (e.g., wardrobe grid auto-updates when an
-- enhancement completes). Realtime checks RLS to decide what rows a client
-- can subscribe to. Without RLS policies, authenticated clients see nothing.
--
-- DESIGN
-- - A helper function `public.app_user_id()` resolves the JWT's auth.uid() to
--   our canonical app users.id via the auth_user_id column.
-- - Every user-scoped table gets RLS enabled with a SELECT policy that
--   matches user_id = public.app_user_id().
-- - For tables without a direct user_id (outfit_items), the policy joins
--   to the parent.
-- - We do NOT add INSERT/UPDATE/DELETE policies here. All writes go through
--   server-side capabilities, which use the service role key and bypass RLS.
-- - Globally-shared tables (prompts, prompt_versions, stylist_rules,
--   annotated_examples) get RLS with a permissive SELECT policy so any
--   authenticated user can read them.
--
-- HOW TO REVERT
--   ALTER TABLE <table> DISABLE ROW LEVEL SECURITY;
--   DROP POLICY <name> ON <table>;
--   DROP FUNCTION public.app_user_id();

-- ─── Helper function ───
-- Returns the canonical app users.id for the currently-authenticated Supabase
-- Auth user, or NULL if no auth context (anonymous request).
CREATE OR REPLACE FUNCTION public.app_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT id FROM public.users WHERE auth_user_id = auth.uid()
$$;

-- ─── User-scoped tables: RLS + per-user SELECT policy ───

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_self_select ON users
  FOR SELECT USING (id = public.app_user_id());

ALTER TABLE closets ENABLE ROW LEVEL SECURITY;
CREATE POLICY closets_self_select ON closets
  FOR SELECT USING (user_id = public.app_user_id());

ALTER TABLE closet_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY closet_items_self_select ON closet_items
  FOR SELECT USING (user_id = public.app_user_id());

ALTER TABLE item_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY item_photos_self_select ON item_photos
  FOR SELECT USING (user_id = public.app_user_id());

ALTER TABLE style_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY style_profiles_self_select ON style_profiles
  FOR SELECT USING (user_id = public.app_user_id());

ALTER TABLE style_profile_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY style_profile_versions_self_select ON style_profile_versions
  FOR SELECT USING (user_id = public.app_user_id());

ALTER TABLE contexts ENABLE ROW LEVEL SECURITY;
CREATE POLICY contexts_self_select ON contexts
  FOR SELECT USING (user_id = public.app_user_id());

ALTER TABLE generations ENABLE ROW LEVEL SECURITY;
CREATE POLICY generations_self_select ON generations
  FOR SELECT USING (user_id = public.app_user_id());

ALTER TABLE outfits ENABLE ROW LEVEL SECURITY;
CREATE POLICY outfits_self_select ON outfits
  FOR SELECT USING (user_id = public.app_user_id());

-- outfit_items has no user_id column; join to outfits
ALTER TABLE outfit_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY outfit_items_self_select ON outfit_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM outfits o
      WHERE o.id = outfit_items.outfit_id
        AND o.user_id = public.app_user_id()
    )
  );

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY events_self_select ON events
  FOR SELECT USING (user_id = public.app_user_id());

ALTER TABLE wardrobe_gaps ENABLE ROW LEVEL SECURITY;
CREATE POLICY wardrobe_gaps_self_select ON wardrobe_gaps
  FOR SELECT USING (user_id = public.app_user_id());

-- Stub tables — also user-scoped
ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY chat_conversations_self_select ON chat_conversations
  FOR SELECT USING (user_id = public.app_user_id());

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY chat_messages_self_select ON chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM chat_conversations c
      WHERE c.id = chat_messages.conversation_id
        AND c.user_id = public.app_user_id()
    )
  );

ALTER TABLE try_on_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY try_on_jobs_self_select ON try_on_jobs
  FOR SELECT USING (user_id = public.app_user_id());

ALTER TABLE translations ENABLE ROW LEVEL SECURITY;
CREATE POLICY translations_self_select ON translations
  FOR SELECT USING (user_id = public.app_user_id());

-- ─── Globally-shared tables: RLS on, but any authenticated user can SELECT ───
-- (Server still bypasses via service role for writes.)

ALTER TABLE prompts ENABLE ROW LEVEL SECURITY;
CREATE POLICY prompts_authenticated_select ON prompts
  FOR SELECT TO authenticated USING (true);

ALTER TABLE prompt_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY prompt_versions_authenticated_select ON prompt_versions
  FOR SELECT TO authenticated USING (true);

ALTER TABLE stylist_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY stylist_rules_authenticated_select ON stylist_rules
  FOR SELECT TO authenticated USING (true);

ALTER TABLE annotated_examples ENABLE ROW LEVEL SECURITY;
CREATE POLICY annotated_examples_authenticated_select ON annotated_examples
  FOR SELECT TO authenticated USING (true);

-- ─── Admin-only tables: RLS on, no client policy at all ───
-- Service role still has full access. Clients see nothing.

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
-- No policy = no client access. Intentional.

-- ─── Note on writes ───
-- We deliberately do NOT add INSERT/UPDATE/DELETE policies. Those operations
-- happen server-side via capabilities using the SUPABASE_SECRET_KEY (service
-- role), which bypasses RLS. If a future use case requires client-side writes
-- (e.g., user editing their own profile from the browser without going through
-- the API), add per-table WITH CHECK policies at that time.

-- ─── Realtime publications ───
-- Supabase Realtime only forwards changes for tables that are members of the
-- `supabase_realtime` publication. Add the tables the frontend will subscribe to.
-- Use ALTER PUBLICATION ... ADD TABLE; the publication is created by Supabase.
ALTER PUBLICATION supabase_realtime ADD TABLE
  public.closet_items,
  public.item_photos,
  public.outfits,
  public.style_profiles;
