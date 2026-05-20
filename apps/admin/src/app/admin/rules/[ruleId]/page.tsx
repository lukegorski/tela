import { notFound } from 'next/navigation';
import { getRule } from '@/lib/admin-rules';
import { RuleForm } from '@/components/admin/RuleForm';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export default async function EditRulePage({
  params,
}: {
  params: Promise<{ ruleId: string }>;
}) {
  await requireAdmin();

  const { ruleId } = await params;

  const rule = await getRule(ruleId);
  if (!rule) notFound();

  return (
    <RuleForm
      initial={{
        id: rule.id,
        category: rule.category,
        rule: rule.rule,
        priority: rule.priority,
        active: rule.active,
        version: rule.version,
      }}
    />
  );
}
