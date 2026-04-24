import { isLocale } from '@/lib/i18n';
import { ExampleForm } from '@/components/admin/ExampleForm';

export const dynamic = 'force-dynamic';

export default async function NewExamplePage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const safeLang = isLocale(lang) ? lang : 'en';
  return <ExampleForm lang={safeLang} />;
}
