import { getCurrentAuthUser } from '@/lib/supabase/server';

export default async function SettingsPage() {
  const user = await getCurrentAuthUser();
  return (
    <div className="max-w-2xl mx-auto px-6 py-16 space-y-8">
      <h1 className="text-2xl font-medium tracking-tight">Settings</h1>
      <p className="text-sm text-stone-500">Coming in Phase 8.8.</p>

      <div className="border border-stone-200 p-4 space-y-2">
        <p className="text-xs uppercase tracking-widest text-stone-400">Account</p>
        <p className="font-mono text-sm text-stone-900">{user?.email ?? '(no email)'}</p>
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
