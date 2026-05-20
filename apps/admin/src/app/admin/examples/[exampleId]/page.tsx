import { notFound } from 'next/navigation';
import { getExample } from '@/lib/admin-examples';
import { ExampleForm } from '@/components/admin/ExampleForm';

export const dynamic = 'force-dynamic';

export default async function EditExamplePage({
  params,
}: {
  params: Promise<{ exampleId: string }>;
}) {
  const { exampleId } = await params;

  const example = await getExample(exampleId);
  if (!example) notFound();

  return (
    <ExampleForm
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
