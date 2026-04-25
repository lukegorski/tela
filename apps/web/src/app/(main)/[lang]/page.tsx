/**
 * /[lang] root — the landing surface. Temporary Phase C version: signed-in
 * users get redirected onward (matching the legacy app's flow), signed-out
 * users see a minimal Google-sign-in placeholder.
 *
 * Phase D replaces this with the legacy image-carousel landing (5 hero
 * photos, white logo overlay, mobile + desktop split layout, Google /
 * WhatsApp / Email buttons). Until then, this stub is enough to let
 * signed-out testers actually get into the app.
 *
 * No `/sign-in` route exists — login lives here, matching legacy.
 */
import { redirect } from 'next/navigation';
import { isLocale } from '@/lib/i18n';
import { getCurrentAuthUser } from '@/lib/supabase/server';
import { getAppUserByAuthId } from '@/lib/users';
import { LandingPlaceholder } from '@/components/auth/LandingPlaceholder';

export const dynamic = 'force-dynamic';

export default async function LangIndex({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const safeLang = isLocale(lang) ? lang : 'en';

  const authUser = await getCurrentAuthUser();
  if (authUser) {
    const user = await getAppUserByAuthId(authUser.id);
    if (!user || !user.onboardingComplete) {
      redirect(`/${safeLang}/onboarding`);
    }
    // Legacy flow: send users with no style profile to /chat (so Tela can
    // guide them); send everyone else to /outfits. We don't have a fast
    // server-side check for "has profile" here yet — defer to /chat which
    // is the safe choice (chat works regardless of profile state).
    redirect(`/${safeLang}/chat`);
  }

  return <LandingPlaceholder lang={safeLang} />;
}
