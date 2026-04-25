import { OnboardingForm } from '@/components/onboarding/OnboardingForm';

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  return (
    <div className="min-h-dvh">
      <div className="max-w-xl mx-auto px-6 pt-12 pb-8">
        <h1 className="text-2xl font-medium tracking-tight">Welcome to tela</h1>
        <p className="mt-2 text-sm text-stone-500">
          A few quick questions so we can style for you, not at you.
        </p>
      </div>
      <OnboardingForm lang={lang} />
    </div>
  );
}
