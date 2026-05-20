/**
 * Prompts — list view. One row per prompt name with version count + latest
 * update timestamp. Click through to /admin/prompts/[name] for the full
 * version history + editor.
 *
 * Note: this index doesn't show prompts that exist as files but haven't
 * been synced to the DB yet. The runtime always reads from DB, so a missing
 * prompt here means it'd also fail at call time — run the sync script.
 */
import Link from 'next/link';
import { listPrompts } from '@/lib/admin-prompts';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export default async function AdminPromptsPage() {
  await requireAdmin();

  const base = `/admin/prompts`;

  const prompts = await listPrompts();

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-medium tracking-tight">Prompts</h2>
        <p className="text-sm text-stone-500">
          {prompts.length} prompt{prompts.length === 1 ? '' : 's'}. Templates live both as files
          (source of truth) and as DB rows (runtime). New names come from the file-template sync;
          edits here create new versions.
        </p>
      </header>

      {prompts.length === 0 ? (
        <div className="border border-dashed border-stone-300 px-6 py-12 text-center text-sm text-stone-500">
          No prompts found in DB. Run the file-template sync to seed them.
        </div>
      ) : (
        <ul className="border border-stone-200 divide-y divide-stone-200">
          {prompts.map((p) => (
            <li key={p.id}>
              <Link
                href={`${base}/${encodeURIComponent(p.name)}`}
                className="flex items-start justify-between gap-4 px-4 py-4 hover:bg-stone-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium font-mono text-stone-900">{p.name}</p>
                  <p className="mt-1 text-xs text-stone-500 line-clamp-2">{p.description}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-mono text-stone-700">
                    {p.versionCount} version{p.versionCount === 1 ? '' : 's'}
                  </p>
                  {p.latestUpdatedAt && (
                    <p className="mt-1 text-xs text-stone-400">
                      {new Date(p.latestUpdatedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
