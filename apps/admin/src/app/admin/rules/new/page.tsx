import { RuleForm } from '@/components/admin/RuleForm';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export default async function NewRulePage() {
  await requireAdmin();
  return <RuleForm />;
}
