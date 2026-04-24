'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/trpc/client';

export function SaveOutfitButton({
  outfitId,
  initiallySaved,
}: {
  outfitId: string;
  initiallySaved: boolean;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initiallySaved);
  const execute = trpc.capability.execute.useMutation();

  async function toggle() {
    const next = !saved;
    setSaved(next); // optimistic
    try {
      await execute.mutateAsync({
        name: 'outfit.save',
        input: { outfitId, saved: next },
      });
      router.refresh();
    } catch (err) {
      setSaved(!next); // revert
      alert(err instanceof Error ? err.message : 'Failed to save');
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={execute.isPending}
      className={`px-4 py-2 text-sm transition-colors ${
        saved
          ? 'bg-stone-700 text-stone-50 hover:bg-stone-600'
          : 'border border-stone-300 text-stone-700 hover:border-stone-400'
      } disabled:opacity-50`}
    >
      {execute.isPending ? '…' : saved ? 'Saved' : 'Save outfit'}
    </button>
  );
}
