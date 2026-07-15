-- Drift reconciliation (dev-environment split, 2026-07-14): captures the
-- hand-applied hardening found on production by the Phase 0 schema audit so
-- new environments (dev project standup) reproduce prod's effective state.
-- Provenance: applied by hand to prod at some point before 2026-07-14; not in
-- any journaled migration. Verified against `pg_dump --schema-only` of prod.
--
-- Three parts:
--   1. RLS auto-enable machinery — event trigger that force-enables RLS on
--      every new public table (this is why outfit_drafts, migration_log and
--      migration_failures have RLS despite not appearing in manual_001).
--   2. Explicit RLS enable for the three tables that postdate manual_001
--      (idempotent; a fresh standup applying this file AFTER db:migrate needs
--      them since the event trigger wasn't installed during migration).
--   3. Client-role lockdown — revoke DML from anon/authenticated/service_role
--      on all public tables + matching default-privilege changes, so the only
--      client-visible surface is what RLS policies + explicit grants allow.
--      (App SQL runs as `postgres` via DATABASE_URL and is unaffected.)
--
-- Ordering: run AFTER manual_001 and manual_002. Part 3's table-level REVOKE
-- does not remove manual_002's column-level grant, but the grant is re-asserted
-- at the end for order-independence.
--
-- HOW TO REVERT
--   DROP EVENT TRIGGER ensure_rls; DROP FUNCTION public.rls_auto_enable();
--   (grants: re-GRANT per Supabase defaults if ever needed)

-- ─── 1. RLS auto-enable machinery ───

CREATE OR REPLACE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;

DROP EVENT TRIGGER IF EXISTS ensure_rls;
CREATE EVENT TRIGGER ensure_rls ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION public.rls_auto_enable();

-- ─── 2. RLS on tables created after manual_001 ───

ALTER TABLE public.migration_failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.migration_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outfit_drafts ENABLE ROW LEVEL SECURITY;

-- ─── 3. Client-role DML lockdown ───
-- Matches prod: client roles keep only REFERENCES/TRIGGER/TRUNCATE(/MAINTAIN)
-- on tables; sequences keep only UPDATE. No sequences exist today — the
-- default-privilege change covers any future ones.

REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  FROM anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE SELECT, USAGE ON SEQUENCES FROM anon, authenticated, service_role;

-- Re-assert manual_002's column-level grant (survives the table-level REVOKE
-- above per PostgreSQL semantics, but asserted here for order-independence).
GRANT SELECT (id, auth_user_id, features) ON public.users TO authenticated;
