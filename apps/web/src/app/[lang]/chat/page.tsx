import { redirect } from 'next/navigation';
import { isLocale } from '@/lib/i18n';
import { getCurrentAuthUser } from '@/lib/supabase/server';
import { getAppUserByAuthId } from '@/lib/users';
import { getLatestConversation } from '@/lib/chat';
import { ChatComposer } from '@/components/chat/ChatComposer';

export const dynamic = 'force-dynamic';

export default async function ChatPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const safeLang = isLocale(lang) ? lang : 'en';

  const authUser = await getCurrentAuthUser();
  if (!authUser) redirect('/sign-in');

  const appUser = await getAppUserByAuthId(authUser.id);
  if (!appUser || !appUser.onboardingComplete) {
    redirect(`/${safeLang}/onboarding`);
  }

  const convo = await getLatestConversation(appUser.id);

  return (
    <ChatComposer
      conversationId={convo?.id ?? null}
      initialMessages={convo?.messages ?? []}
      lang={safeLang}
    />
  );
}
