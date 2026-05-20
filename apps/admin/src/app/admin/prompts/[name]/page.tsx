import { notFound } from 'next/navigation';
import { getPromptDetail } from '@/lib/admin-prompts';
import { PromptEditor } from '@/components/admin/PromptEditor';

export const dynamic = 'force-dynamic';

export default async function PromptDetailPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;

  // Next URL-encodes path segments containing '.' but the route param arrives
  // already decoded — defensive decode in case.
  const promptName = decodeURIComponent(name);

  const detail = await getPromptDetail(promptName);
  if (!detail) notFound();

  return (
    <PromptEditor
      name={detail.name}
      description={detail.description}
      latestVersionId={detail.latestVersionId}
      versions={detail.versions}
    />
  );
}
