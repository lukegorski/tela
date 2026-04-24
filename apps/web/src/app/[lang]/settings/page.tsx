import { redirect } from 'next/navigation';
import { isLocale } from '@/lib/i18n';
import { getCurrentAuthUser } from '@/lib/supabase/server';
import { getAppUserByAuthId } from '@/lib/users';
import { getStyleProfileForUser } from '@/lib/profile';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const safeLang = isLocale(lang) ? lang : 'en';

  const authUser = await getCurrentAuthUser();
  if (!authUser) redirect('/sign-in');

  const appUser = await getAppUserByAuthId(authUser.id);
  if (!appUser) redirect('/sign-in');

  const profile = await getStyleProfileForUser(appUser.id);

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
      <h1 className="text-2xl font-medium tracking-tight">Settings</h1>

      <Section title="Account">
        <Field label="Email">{appUser.email ?? '(none)'}</Field>
        <Field label="Phone">{appUser.phone ?? 'not added'}</Field>
        <Field label="Locale">{appUser.locale}</Field>
        <Field label="Onboarding">
          {appUser.onboardingComplete ? '✓ complete' : 'incomplete'}
        </Field>
      </Section>

      {appUser.preferences && (
        <Section title="Style preferences">
          <Field label="Style keywords">
            {appUser.preferences.styleKeywords.join(', ') || '—'}
          </Field>
          <Field label="Favorite colors">
            {appUser.preferences.favoriteColors.join(', ') || '—'}
          </Field>
          <Field label="Avoid colors">
            {appUser.preferences.avoidColors.join(', ') || '—'}
          </Field>
          <Field label="Formality">{appUser.preferences.formality}</Field>
          <Field label="Lifestyle">{appUser.preferences.lifestyle}</Field>
        </Section>
      )}

      {appUser.bodyInfo && (
        <Section title="Body info">
          <Field label="Body type">{appUser.bodyInfo.bodyType}</Field>
          <Field label="Height">{appUser.bodyInfo.height}</Field>
          <Field label="Preferred fit">{appUser.bodyInfo.fitPreference}</Field>
        </Section>
      )}

      <Section title="Location">
        {appUser.location ? (
          <>
            <Field label="City">
              {appUser.location.city}, {appUser.location.country}
            </Field>
            <Field label="Timezone">{appUser.location.timezone}</Field>
            <Field label="Temp unit">{appUser.location.tempUnit}°</Field>
          </>
        ) : (
          <p className="text-sm text-stone-500">
            Not set yet. Set this up to enable weather-aware outfit suggestions.
          </p>
        )}
      </Section>

      {profile && (
        <Section title="Style profile">
          <details>
            <summary className="text-sm text-stone-700 cursor-pointer hover:text-stone-900">
              View closet read
            </summary>
            <div className="mt-3 text-sm text-stone-700 leading-relaxed whitespace-pre-wrap">
              {profile.profileText}
            </div>
          </details>

          <div className="pt-4 space-y-2">
            <p className="text-xs uppercase tracking-widest text-stone-400">Dimensions</p>
            {Object.entries(profile.dimensions).map(([k, v]) => (
              <div key={k} className="flex items-center gap-3 text-xs">
                <span className="w-32 text-stone-500">{k}</span>
                <div className="flex-1 h-1 bg-stone-100 relative">
                  <div
                    className="absolute top-0 left-0 h-1 bg-stone-700"
                    style={{ width: `${v * 100}%` }}
                  />
                </div>
                <span className="font-mono text-stone-700 w-10 text-right">{v.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Session">
        <form action="/auth/sign-out" method="post">
          <button
            type="submit"
            className="px-4 py-2 border border-stone-300 hover:border-stone-400 text-sm transition-colors"
          >
            Sign out
          </button>
        </form>
      </Section>

      {/* Hidden affordance: developer/diagnostic info */}
      <details className="text-xs text-stone-400">
        <summary className="cursor-pointer hover:text-stone-600">Developer info</summary>
        <div className="mt-2 space-y-1 font-mono">
          <div>app userId: {appUser.id}</div>
          <div>auth userId: {authUser.id}</div>
          <div>locale: {safeLang}</div>
        </div>
      </details>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-stone-200 pt-5">
      <h2 className="text-xs uppercase tracking-widest text-stone-400 mb-3">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-xs text-stone-400 w-32">{label}</span>
      <span className="text-sm text-stone-700">{children}</span>
    </div>
  );
}
