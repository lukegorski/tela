import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export default async function ComingSoonPage() {
  await requireAdmin();
  return (
    <div className="px-6 py-12 text-center text-sm text-stone-500 dark:text-stone-400">
      Coming soon (14b)
    </div>
  );
}
