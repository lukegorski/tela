import { notFound } from 'next/navigation';
import { isLocale } from '@/lib/i18n';
import { getRule } from '@/lib/admin-rules';
import { RuleForm } from '@/components/admin/RuleForm';

export const dynamic = 'force-dynamic';

export default async function EditRulePage({
  params,
}: {
  params: Promise<{ lang: string; ruleId: string }>;
}) {
  const { lang, ruleId } = await params;
  const safeLang = isLocale(lang) ? lang : 'en';

  const rule = await getRule(ruleId);
  if (!rule) notFound();

  return (
    <RuleForm
      lang={safeLang}
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
