/**
 * Server-side admin gate for /admin/* routes. Fires before any RSC page
 * under this subtree renders, so unauth users get redirected and signed-in
 * non-admins get a 404 — neither sees any DB-fetched output.
 *
 * Layered with the client-side AdminGate in the root layout: this server
 * gate keeps RSC output from leaking; AdminGate handles the rest of the
 * UX (login screen, loading spinner, no-access screen, mobile nav). See
 * Path A architectural decision #10 in docs/phase-14-admin-parity.md.
 */
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export default async function AdminSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  return <>{children}</>;
}
