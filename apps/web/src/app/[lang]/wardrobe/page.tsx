// Phase 8.5 will build the real wardrobe grid.
// For now: a placeholder that proves auth + i18n + layout all work.
import { getCurrentAuthUser } from '@/lib/supabase/server';
import { getDictionary } from '@/dictionaries';
import { isLocale } from '@/lib/i18n';

export default async function WardrobePage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const dict = isLocale(lang) ? await getDictionary(lang) : null;
  const user = await getCurrentAuthUser();

  return (
    <div className="max-w-2xl mx-auto px-6 py-16 space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-medium tracking-tight">
          {dict?.nav?.pieces ?? 'Wardrobe'}
        </h1>
        <p className="text-sm text-stone-500">
          Coming in Phase 8.5. For now, this proves auth + i18n + layout work.
        </p>
      </div>

      <div className="border border-stone-200 p-4 space-y-2">
        <p className="text-xs uppercase tracking-widest text-stone-400">Signed in as</p>
        <p className="font-mono text-sm text-stone-900">{user?.email ?? '(no email)'}</p>
        <p className="text-xs text-stone-500">locale: {lang}</p>
        <p className="text-xs text-stone-500">auth user id: {user?.id}</p>
      </div>

      <form action="/auth/sign-out" method="post">
        <button
          type="submit"
          className="px-4 py-2 border border-stone-300 hover:border-stone-400 text-sm transition-colors"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
