import { notFound } from 'next/navigation';
import { isLocale, locales } from '@/lib/i18n';
import { getDictionary } from '@/dictionaries';
import { DictionaryProvider } from '@/lib/i18n/DictionaryProvider';
import { Navbar } from '@/components/nav/Navbar';
import { MobileNav } from '@/components/nav/MobileNav';
import { requireAuth } from '@/lib/auth';

export async function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export default async function LangLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  // Every page inside [lang] requires auth — redirect to /sign-in if not signed in
  await requireAuth();

  const dictionary = await getDictionary(lang);

  return (
    <DictionaryProvider dictionary={dictionary} lang={lang}>
      <div className="min-h-dvh bg-white text-stone-900 flex flex-col">
        <Navbar />
        <main className="flex-1 pb-16 sm:pb-0">{children}</main>
        <MobileNav />
      </div>
    </DictionaryProvider>
  );
}
