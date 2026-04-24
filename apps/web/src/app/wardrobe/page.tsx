// Placeholder page — proves auth flow works end-to-end.
// Phase 8.5 will build the real wardrobe grid.
import { requireAuth } from '@/lib/auth';

export default async function WardrobePage() {
  const user = await requireAuth();

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-6 py-16 space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-medium tracking-tight">Wardrobe</h1>
          <p className="text-sm text-stone-500">
            Coming in Phase 8.5. For now, this page proves you&apos;re signed in.
          </p>
        </div>

        <div className="border border-stone-200 p-4 space-y-2">
          <p className="text-xs uppercase tracking-widest text-stone-400">Signed in as</p>
          <p className="font-mono text-sm text-stone-900">{user.email ?? '(no email)'}</p>
          <p className="text-xs text-stone-500">auth user id: {user.id}</p>
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
    </div>
  );
}
