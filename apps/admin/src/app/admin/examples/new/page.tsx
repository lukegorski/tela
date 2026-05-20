import { ExampleForm } from '@/components/admin/ExampleForm';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export default async function NewExamplePage() {
  await requireAdmin();
  return <ExampleForm />;
}
