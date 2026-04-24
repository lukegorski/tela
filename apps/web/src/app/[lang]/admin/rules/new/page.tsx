import { isLocale } from '@/lib/i18n';
import { RuleForm } from '@/components/admin/RuleForm';

export const dynamic = 'force-dynamic';

export default async function NewRulePage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const safeLang = isLocale(lang) ? lang : 'en';
  return <RuleForm lang={safeLang} />;
}
