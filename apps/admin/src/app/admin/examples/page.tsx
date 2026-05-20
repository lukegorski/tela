import Link from 'next/link';
import { listAllExamples } from '@/lib/admin-examples';

export const dynamic = 'force-dynamic';

export default async function AdminExamplesPage() {
  const base = `/admin/examples`;

  const examples = await listAllExamples();

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium tracking-tight">Annotated examples</h2>
          <p className="text-sm text-stone-500">
            {examples.length} example{examples.length === 1 ? '' : 's'}
          </p>
        </div>
        <Link
          href={`${base}/new`}
          className="px-4 py-2 bg-stone-700 text-stone-50 text-sm hover:bg-stone-600 transition-colors"
        >
          New example
        </Link>
      </header>

      {examples.length === 0 ? (
        <div className="border border-dashed border-stone-300 px-6 py-12 text-center text-sm text-stone-500">
          No examples yet. Add one to anchor the closet read + outfit generation prompts.
        </div>
      ) : (
        <ul className="border border-stone-200 divide-y divide-stone-200">
          {examples.map((ex) => (
            <li key={ex.id}>
              <Link
                href={`${base}/${ex.id}`}
                className="block px-4 py-4 hover:bg-stone-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-stone-900">{ex.title}</p>
                    <p className="mt-1 text-xs text-stone-500 line-clamp-2">
                      {ex.outfitDescription}
                    </p>
                    {ex.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {ex.tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-block px-2 py-0.5 bg-stone-100 text-stone-500 text-xs"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-stone-400 font-mono whitespace-nowrap">
                    {new Date(ex.updatedAt).toLocaleDateString()}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
