import { notFound } from 'next/navigation';
import { isLocale } from '@/lib/i18n';
import { getExample } from '@/lib/admin-examples';
import { ExampleForm } from '@/components/admin/ExampleForm';

export const dynamic = 'force-dynamic';

export default async function EditExamplePage({
  params,
}: {
  params: Promise<{ lang: string; exampleId: string }>;
}) {
  const { lang, exampleId } = await params;
  const safeLang = isLocale(lang) ? lang : 'en';

  const example = await getExample(exampleId);
  if (!example) notFound();

  return (
    <ExampleForm
      lang={safeLang}
      initial={{
        id: example.id,
        title: example.title,
        outfitDescription: example.outfitDescription,
        reasoning: example.reasoning,
        context: example.context,
        tags: example.tags,
      }}
    />
  );
}
