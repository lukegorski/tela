'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AdminAiChat } from './AdminAiChat';

// Slide-out panel that hosts the AdminAiChat on the right edge of the
// admin app. Hidden on mobile (mobile uses the dedicated /admin/ai page
// route — the 420px slide-out doesn't fit a phone). Visibility is driven
// from AdminGate via the `open` prop; this component handles only the
// slide-in / slide-out animation.
//
// Suppressed on /admin/ai itself — that page already renders a full
// AdminAiChat in variant="page", and stacking the slide-out on top would
// show two redundant chat columns.
export function AdminAiPanel({ open }: { open: boolean }) {
  const pathname = usePathname();
  const onAiPage = pathname?.startsWith('/admin/ai') ?? false;

  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setVisible(true);
      setClosing(false);
      return;
    }
    if (!visible) return;
    setClosing(true);
    const timer = setTimeout(() => {
      setVisible(false);
      setClosing(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [open, visible]);

  if (onAiPage) return null;
  if (!visible) return null;

  return (
    <div
      className={`hidden sm:flex fixed top-[3.5rem] right-0 bottom-0 w-[420px] z-40 flex-col bg-white dark:bg-neutral-900 border-l border-stone-200 dark:border-neutral-800 shadow-lg transition-transform duration-300 ease-out ${
        closing ? 'translate-x-full' : 'animate-[slideRight_300ms_ease-out]'
      }`}
    >
      <AdminAiChat variant="panel" />
    </div>
  );
}
