/**
 * Outfit Builder — dark route (spec §8a): no links from existing UI point
 * here; access requires authentication AND the builder entitlement, gated
 * SERVER-SIDE so a flag-off user gets redirected even via typed URL.
 * Rollback = flip the flag; no deploy.
 */
import { redirect } from 'next/navigation';
import { requireAuth, landingHref } from '@/lib/auth';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { deriveEntitlements } from '@tela/types';
import BuilderScreen from './BuilderScreen';

export default async function BuilderPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const user = await requireAuth(lang);

  // Entitlements choke point (spec §5): the gate reads the derivation,
  // never users.features directly. The RLS-scoped select can only ever
  // see the caller's own row; any read failure degrades to builder=false
  // — the gate fails CLOSED.
  const supabase = await getSupabaseServerClient();
  const { data: row } = await supabase
    .from('users')
    .select('features')
    .eq('auth_user_id', user.id)
    .single();
  const entitlements = deriveEntitlements({ features: row?.features ?? {} });
  if (!entitlements.builder) {
    redirect(landingHref(lang));
  }

  return <BuilderScreen />;
}
