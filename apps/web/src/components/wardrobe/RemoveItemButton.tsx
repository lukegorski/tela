'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { trpc } from '@/trpc/client';

export function RemoveItemButton({ itemId, lang }: { itemId: string; lang: string }) {
  const router = useRouter();
  const remove = trpc.capability.execute.useMutation();
  const [confirming, setConfirming] = useState(false);

  async function handleRemove() {
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 3000);
      return;
    }
    try {
      await remove.mutateAsync({
        name: 'wardrobe.removeItem',
        input: { itemId },
      });
      router.push(`/${lang}/wardrobe`);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove');
    }
  }

  return (
    <button
      type="button"
      onClick={handleRemove}
      disabled={remove.isPending}
      className={`px-4 py-2 text-sm transition-colors ${
        confirming
          ? 'bg-red-600 text-white hover:bg-red-700'
          : 'border border-stone-300 text-stone-700 hover:border-stone-400'
      } disabled:opacity-50`}
    >
      {remove.isPending ? 'Removing…' : confirming ? 'Confirm remove' : 'Remove from closet'}
    </button>
  );
}
