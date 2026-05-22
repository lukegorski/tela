/**
 * Full-page admin chat at /admin/ai. Mobile-first surface — the slide-out
 * AdminAiPanel doesn't fit on phones (420px wide), so the hamburger
 * menu's "AI" link routes here instead. On desktop this serves as the
 * second home for the chat if the admin wants a roomier layout than the
 * panel.
 *
 * The per-page `await requireAdmin()` is the established 14a pattern
 * (commit a481fb9). Defense-in-depth on top of the /admin/* server
 * layout gate.
 */
import { requireAdmin } from '@/lib/admin';
import { AdminAiChat } from '@/components/admin-chrome/AdminAiChat';

export const dynamic = 'force-dynamic';

export default async function AdminAiPage() {
  await requireAdmin();
  return <AdminAiChat variant="page" />;
}
