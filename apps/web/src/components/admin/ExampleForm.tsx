'use client';

/**
 * Annotated example editor (create + edit). Mirrors RuleForm's structure.
 * Tags are entered as a comma-separated list; we split + trim on submit.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { trpc } from '@/trpc/client';

interface ExampleFormProps {
  initial?: {
    id: string;
    title: string;
    outfitDescription: string;
    reasoning: string;
    context: string;
    tags: string[];
  };
}

export function ExampleForm({ initial }: ExampleFormProps) {
  const router = useRouter();
  const isEditing = Boolean(initial?.id);

  const [title, setTitle] = useState(initial?.title ?? '');
  const [outfitDescription, setOutfitDescription] = useState(initial?.outfitDescription ?? '');
  const [reasoning, setReasoning] = useState(initial?.reasoning ?? '');
  const [context, setContext] = useState(initial?.context ?? '');
  const [tagsCsv, setTagsCsv] = useState((initial?.tags ?? []).join(', '));
  const [status, setStatus] = useState('');

  const execute = trpc.capability.execute.useMutation();

  function parsedTags(): string[] {
    return tagsCsv
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!title.trim() || !outfitDescription.trim() || !reasoning.trim() || !context.trim()) {
      setStatus('Title, outfit description, reasoning, and context are all required.');
      return;
    }

    setStatus('Saving…');
    try {
      const payload = {
        title: title.trim(),
        outfitDescription: outfitDescription.trim(),
        reasoning: reasoning.trim(),
        context: context.trim(),
        tags: parsedTags(),
      };
      if (isEditing && initial) {
        await execute.mutateAsync({
          name: 'admin.updateExample',
          input: { id: initial.id, ...payload },
        });
      } else {
        await execute.mutateAsync({
          name: 'admin.createExample',
          input: payload,
        });
      }
      router.push(`/admin/examples`);
      router.refresh();
    } catch (err) {
      setStatus(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleDelete() {
    if (!isEditing || !initial) return;
    if (!confirm("Permanently delete this example? This can't be undone.")) return;

    setStatus('Deleting…');
    try {
      await execute.mutateAsync({
        name: 'admin.deleteExample',
        input: { id: initial.id },
      });
      router.push(`/admin/examples`);
      router.refresh();
    } catch (err) {
      setStatus(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium tracking-tight">
          {isEditing ? 'Edit annotated example' : 'New annotated example'}
        </h2>
        <Link
          href={`/admin/examples`}
          className="text-sm text-stone-500 hover:text-stone-900"
        >
          Cancel
        </Link>
      </div>

      <Field label="Title" hint="Short, recognizable. Shown in lists.">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-3 py-2 border border-stone-300 text-sm focus:outline-none focus:ring-1 focus:ring-stone-400 focus:border-stone-400"
        />
      </Field>

      <Field
        label="Outfit description"
        hint="The actual outfit. Item names, colors, fabrics. As literal as possible."
      >
        <textarea
          value={outfitDescription}
          onChange={(e) => setOutfitDescription(e.target.value)}
          rows={4}
          className="w-full px-3 py-2 border border-stone-300 text-sm focus:outline-none focus:ring-1 focus:ring-stone-400 focus:border-stone-400"
        />
      </Field>

      <Field
        label="Reasoning"
        hint="Cofounder's thinking — why this works. The model learns the diagnostic process from this."
      >
        <textarea
          value={reasoning}
          onChange={(e) => setReasoning(e.target.value)}
          rows={6}
          className="w-full px-3 py-2 border border-stone-300 text-sm focus:outline-none focus:ring-1 focus:ring-stone-400 focus:border-stone-400"
        />
      </Field>

      <Field label="Context" hint="When / for whom. Occasion, body, weather, mood.">
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border border-stone-300 text-sm focus:outline-none focus:ring-1 focus:ring-stone-400 focus:border-stone-400"
        />
      </Field>

      <Field label="Tags" hint="Comma-separated. Used to filter / surface relevant examples.">
        <input
          type="text"
          value={tagsCsv}
          onChange={(e) => setTagsCsv(e.target.value)}
          placeholder="e.g. work, fall, monochrome"
          className="w-full px-3 py-2 border border-stone-300 text-sm focus:outline-none focus:ring-1 focus:ring-stone-400 focus:border-stone-400"
        />
      </Field>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={execute.isPending}
          className="px-5 py-2 bg-stone-700 text-stone-50 text-sm hover:bg-stone-600 disabled:opacity-50 transition-colors"
        >
          {execute.isPending ? 'Saving…' : isEditing ? 'Save changes' : 'Create example'}
        </button>

        {isEditing && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={execute.isPending}
            className="px-4 py-2 border border-stone-300 text-sm text-stone-700 hover:border-red-400 hover:text-red-600 transition-colors"
          >
            Delete
          </button>
        )}

        {status && <p className="text-xs text-stone-500">{status}</p>}
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-widest text-stone-400 mb-1">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-stone-400">{hint}</p>}
    </div>
  );
}
