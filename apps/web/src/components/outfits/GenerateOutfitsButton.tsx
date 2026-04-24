'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/trpc/client';

type Occasion = 'everyday' | 'work' | 'date_night' | 'formal' | 'weekend' | 'active' | 'travel';

const OCCASIONS: { value: Occasion; label: string }[] = [
  { value: 'everyday', label: 'Everyday' },
  { value: 'work', label: 'Work' },
  { value: 'weekend', label: 'Weekend' },
  { value: 'date_night', label: 'Date night' },
  { value: 'formal', label: 'Formal' },
  { value: 'active', label: 'Active' },
  { value: 'travel', label: 'Travel' },
];

export function GenerateOutfitsButton() {
  const router = useRouter();
  const execute = trpc.capability.execute.useMutation();
  const [open, setOpen] = useState(false);
  const [occasion, setOccasion] = useState<Occasion>('everyday');
  const [calendar, setCalendar] = useState('');
  const [status, setStatus] = useState('');

  async function handleGenerate() {
    setStatus('Assembling context…');
    try {
      const ctx = (await execute.mutateAsync({
        name: 'context.assemble',
        input: {
          occasion,
          calendarContext: calendar || null,
        },
      })) as { contextId: string };

      setStatus('Generating outfits…');
      await execute.mutateAsync({
        name: 'outfit.generate',
        input: { contextId: ctx.contextId, count: 3 },
      });

      setStatus('Done.');
      setOpen(false);
      router.refresh();
      setTimeout(() => setStatus(''), 1500);
    } catch (err) {
      setStatus(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-5 py-3 bg-stone-700 text-stone-50 text-sm font-medium hover:bg-stone-600 transition-colors"
      >
        Generate outfits
      </button>
    );
  }

  return (
    <div className="border border-stone-200 p-4 space-y-4 max-w-md">
      <h3 className="text-sm font-medium">What&apos;s this for?</h3>

      <div className="flex flex-wrap gap-2">
        {OCCASIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setOccasion(o.value)}
            className={`px-3 py-2 text-xs transition-colors ${
              occasion === o.value
                ? 'bg-stone-700 text-stone-50'
                : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div>
        <label className="block text-xs uppercase tracking-widest text-stone-400 mb-1">
          Calendar context (optional)
        </label>
        <input
          type="text"
          value={calendar}
          onChange={(e) => setCalendar(e.target.value)}
          placeholder="e.g. Lunch with cofounder, dinner at a steakhouse"
          className="w-full px-3 py-2 border border-stone-300 text-sm focus:outline-none focus:ring-1 focus:ring-stone-400 focus:border-stone-400"
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={execute.isPending}
          className="px-4 py-2 bg-stone-700 text-stone-50 text-sm hover:bg-stone-600 disabled:opacity-50 transition-colors"
        >
          {execute.isPending ? 'Working…' : 'Generate 3 outfits'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setStatus('');
          }}
          className="px-4 py-2 text-sm text-stone-500 hover:text-stone-900"
        >
          Cancel
        </button>
      </div>
      {status && <p className="text-xs text-stone-500">{status}</p>}
    </div>
  );
}
