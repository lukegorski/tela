'use client';

/**
 * Prompt editor — shows current template + version history, lets admin
 * create a new version (with optional immediate promotion) and roll back
 * to past versions.
 *
 * Layout:
 *   - Top: live editor for the latest template
 *   - Below: collapsible version history with rollback buttons
 *
 * Server-side has loaded the prompt + history; this is purely UI + tRPC
 * mutations. After every mutation we router.refresh() so the parent RSC
 * re-fetches.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { trpc } from '@/trpc/client';

export interface PromptEditorVersion {
  id: string;
  template: string;
  variables: string[];
  changelog: string | null;
  createdAt: string;
  isLatest: boolean;
}

interface PromptEditorProps {
  name: string;
  description: string;
  latestVersionId: string | null;
  versions: PromptEditorVersion[];
}

export function PromptEditor({
  name,
  description,
  latestVersionId,
  versions,
}: PromptEditorProps) {
  const router = useRouter();
  const execute = trpc.capability.execute.useMutation();

  const latest = versions.find((v) => v.id === latestVersionId) ?? versions[0];
  const variablesString = latest?.variables.join(', ') ?? '';

  const [template, setTemplate] = useState(latest?.template ?? '');
  const [variablesCsv, setVariablesCsv] = useState(variablesString);
  const [changelog, setChangelog] = useState('');
  const [promote, setPromote] = useState(true);
  const [status, setStatus] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  function parseVariables(): string[] {
    return variablesCsv
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!template.trim()) {
      setStatus('Template is required.');
      return;
    }
    setStatus(promote ? 'Saving + promoting…' : 'Saving as draft…');
    try {
      await execute.mutateAsync({
        name: 'admin.createPromptVersion',
        input: {
          name,
          template,
          variables: parseVariables(),
          changelog: changelog.trim() || undefined,
          promote,
        },
      });
      setChangelog('');
      setStatus(promote ? 'Saved + live.' : 'Saved as draft.');
      router.refresh();
    } catch (err) {
      setStatus(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleRollback(versionId: string) {
    if (!confirm('Roll back the live version to this one?')) return;
    setStatus('Rolling back…');
    try {
      await execute.mutateAsync({
        name: 'admin.rollbackPrompt',
        input: { name, versionId },
      });
      setStatus('Rolled back.');
      router.refresh();
    } catch (err) {
      setStatus(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-stone-400">prompt</p>
          <h2 className="mt-1 text-lg font-medium font-mono tracking-tight">{name}</h2>
          <p className="mt-1 text-sm text-stone-500">{description}</p>
        </div>
        <Link href={`/admin/prompts`} className="text-sm text-stone-500 hover:text-stone-900">
          Back
        </Link>
      </header>

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-xs uppercase tracking-widest text-stone-400 mb-1">
            Template
          </label>
          <textarea
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            rows={20}
            className="w-full px-3 py-2 border border-stone-300 text-xs font-mono leading-relaxed focus:outline-none focus:ring-1 focus:ring-stone-400 focus:border-stone-400"
          />
        </div>

        <div>
          <label className="block text-xs uppercase tracking-widest text-stone-400 mb-1">
            Variables
          </label>
          <input
            type="text"
            value={variablesCsv}
            onChange={(e) => setVariablesCsv(e.target.value)}
            placeholder="comma-separated, e.g. profile_text, wardrobe_summary"
            className="w-full px-3 py-2 border border-stone-300 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-stone-400 focus:border-stone-400"
          />
        </div>

        <div>
          <label className="block text-xs uppercase tracking-widest text-stone-400 mb-1">
            Changelog
          </label>
          <input
            type="text"
            value={changelog}
            onChange={(e) => setChangelog(e.target.value)}
            placeholder="e.g. tightened tone, added clarity on what 'don't know' means"
            className="w-full px-3 py-2 border border-stone-300 text-sm focus:outline-none focus:ring-1 focus:ring-stone-400 focus:border-stone-400"
          />
        </div>

        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={promote}
            onChange={(e) => setPromote(e.target.checked)}
            className="w-4 h-4"
          />
          Make live immediately (uncheck to save as draft)
        </label>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={execute.isPending}
            className="px-5 py-2 bg-stone-700 text-stone-50 text-sm hover:bg-stone-600 disabled:opacity-50 transition-colors"
          >
            {execute.isPending ? 'Saving…' : promote ? 'Save + promote' : 'Save as draft'}
          </button>
          {status && <p className="text-xs text-stone-500">{status}</p>}
        </div>
      </form>

      <section>
        <button
          type="button"
          onClick={() => setShowHistory((s) => !s)}
          className="text-xs uppercase tracking-widest text-stone-400 hover:text-stone-700"
        >
          {showHistory ? 'Hide' : 'Show'} version history ({versions.length})
        </button>

        {showHistory && (
          <ul className="mt-4 border border-stone-200 divide-y divide-stone-200">
            {versions.map((v) => (
              <li key={v.id} className="px-4 py-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-mono text-stone-700">
                      {new Date(v.createdAt).toLocaleString()}
                      {v.isLatest && (
                        <span className="ml-3 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] uppercase tracking-widest">
                          live
                        </span>
                      )}
                    </p>
                    {v.changelog && (
                      <p className="mt-1 text-sm text-stone-700 italic">{v.changelog}</p>
                    )}
                  </div>
                  {!v.isLatest && (
                    <button
                      type="button"
                      onClick={() => handleRollback(v.id)}
                      disabled={execute.isPending}
                      className="px-3 py-1 border border-stone-300 text-xs text-stone-700 hover:border-stone-500 disabled:opacity-50 transition-colors"
                    >
                      Roll back to this
                    </button>
                  )}
                </div>
                <details>
                  <summary className="text-xs text-stone-400 cursor-pointer hover:text-stone-700">
                    View template ({v.template.length} chars)
                  </summary>
                  <pre className="mt-2 px-3 py-2 bg-stone-50 text-xs text-stone-700 leading-relaxed overflow-x-auto whitespace-pre-wrap">
                    {v.template}
                  </pre>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
