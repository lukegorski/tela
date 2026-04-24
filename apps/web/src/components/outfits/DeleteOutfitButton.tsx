'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/trpc/client';

export function DeleteOutfitButton({ outfitId, lang }: { outfitId: string; lang: string }) {
  const router = useRouter();
  const execute = trpc.capability.execute.useMutation();
  const [confirming, setConfirming] = useState(false);

  async function handleDelete() {
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 3000);
      return;
    }
    try {
      await execute.mutateAsync({
        name: 'outfit.delete',
        input: { outfitId },
      });
      router.push(`/${lang}/outfits`);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete');
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={execute.isPending}
      className={`px-4 py-2 text-sm transition-colors ${
        confirming
          ? 'bg-red-600 text-white hover:bg-red-700'
          : 'text-stone-500 hover:text-red-600'
      } disabled:opacity-50`}
    >
      {execute.isPending ? '…' : confirming ? 'Confirm delete' : 'Delete'}
    </button>
  );
}
