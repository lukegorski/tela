'use client';

/**
 * Stylist rule editor. Used for both create (no id) and edit (id passed in).
 *
 * Server-side has read what exists (in the parent RSC) and passes it as
 * `initial`. Submission goes through tRPC to admin.createRule or
 * admin.updateRule based on whether `initial.id` is present.
 *
 * On success, navigates back to /admin/rules and refreshes.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { trpc } from '@/trpc/client';

interface RuleFormProps {
  initial?: {
    id: string;
    category: string;
    rule: string;
    priority: number;
    active: boolean;
    version: number;
  };
}

export function RuleForm({ initial }: RuleFormProps) {
  const router = useRouter();
  const isEditing = Boolean(initial?.id);

  const [category, setCategory] = useState(initial?.category ?? '');
  const [rule, setRule] = useState(initial?.rule ?? '');
  const [priority, setPriority] = useState(initial?.priority ?? 0);
  const [active, setActive] = useState(initial?.active ?? true);
  const [status, setStatus] = useState('');

  const execute = trpc.capability.execute.useMutation();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!category.trim() || !rule.trim()) {
      setStatus('Category and rule are required.');
      return;
    }

    setStatus('Saving…');
    try {
      if (isEditing && initial) {
        await execute.mutateAsync({
          name: 'admin.updateRule',
          input: {
            id: initial.id,
            category: category.trim(),
            rule: rule.trim(),
            priority,
            active,
          },
        });
      } else {
        await execute.mutateAsync({
          name: 'admin.createRule',
          input: {
            category: category.trim(),
            rule: rule.trim(),
            priority,
            active,
          },
        });
      }
      router.push(`/admin/rules`);
      router.refresh();
    } catch (err) {
      setStatus(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleDelete() {
    if (!isEditing || !initial) return;
    if (!confirm(`Permanently delete this rule? This can't be undone.`)) return;

    setStatus('Deleting…');
    try {
      await execute.mutateAsync({
        name: 'admin.deleteRule',
        input: { id: initial.id },
      });
      router.push(`/admin/rules`);
      router.refresh();
    } catch (err) {
      setStatus(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium tracking-tight">
          {isEditing ? 'Edit rule' : 'New rule'}
          {isEditing && initial && (
            <span className="ml-3 text-xs font-mono text-stone-400 uppercase tracking-widest">
              v{initial.version}
            </span>
          )}
        </h2>
        <Link
          href={`/admin/rules`}
          className="text-sm text-stone-500 hover:text-stone-900"
        >
          Cancel
        </Link>
      </div>

      <div>
        <label className="block text-xs uppercase tracking-widest text-stone-400 mb-1">
          Category
        </label>
        <input
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="e.g. color, proportion, occasion"
          className="w-full px-3 py-2 border border-stone-300 text-sm focus:outline-none focus:ring-1 focus:ring-stone-400 focus:border-stone-400"
        />
        <p className="mt-1 text-xs text-stone-400">
          Free-form. Used to group rules in the editor and in prompt context.
        </p>
      </div>

      <div>
        <label className="block text-xs uppercase tracking-widest text-stone-400 mb-1">Rule</label>
        <textarea
          value={rule}
          onChange={(e) => setRule(e.target.value)}
          rows={6}
          placeholder="The actual rule text the stylist will see in its system prompt."
          className="w-full px-3 py-2 border border-stone-300 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-stone-400 focus:border-stone-400"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs uppercase tracking-widest text-stone-400 mb-1">
            Priority
          </label>
          <input
            type="number"
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
            className="w-32 px-3 py-2 border border-stone-300 text-sm focus:outline-none focus:ring-1 focus:ring-stone-400 focus:border-stone-400"
          />
          <p className="mt-1 text-xs text-stone-400">Higher → more prominent in prompt.</p>
        </div>

        <div>
          <label className="block text-xs uppercase tracking-widest text-stone-400 mb-1">
            Status
          </label>
          <label className="inline-flex items-center gap-2 mt-1">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm">Active</span>
          </label>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={execute.isPending}
          className="px-5 py-2 bg-stone-700 text-stone-50 text-sm hover:bg-stone-600 disabled:opacity-50 transition-colors"
        >
          {execute.isPending ? 'Saving…' : isEditing ? 'Save changes' : 'Create rule'}
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
