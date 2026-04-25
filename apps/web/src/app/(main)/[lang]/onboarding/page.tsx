"use client";

/**
 * Pixel-perfect port of legacy src/app/(main)/[lang]/onboarding/page.tsx.
 *
 * Visual + behavior parity:
 *   - Centered max-w-lg container
 *   - Title + subtitle header from dict.onboarding
 *   - 4-step OnboardingForm (style, body, lifestyle, wardrobe gaps)
 *   - Auto-redirect to /outfits if onboarding already complete
 *
 * Data-layer changes vs legacy (no firebase imports):
 *   - Firestore updateDoc(users/{uid}, { preferences, bodyInfo,
 *     wardrobeGaps, onboardingComplete: true }) → trpc.capability.execute
 *     ({name: 'user.completeOnboarding', input: {preferences, bodyInfo,
 *     wardrobeGaps}}). The capability writes the wardrobe_gaps table
 *     rows + flips users.onboarding_complete = true atomically; same
 *     end state.
 */
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import OnboardingForm, { type OnboardingData } from "@/components/OnboardingForm";
import { useAuthContext } from "@/components/AuthProvider";
import { useDictionary } from "@/components/DictionaryProvider";
import { localePath } from "@/lib/i18n";
import { trpc } from "@/trpc/client";

export default function OnboardingPage() {
  const { dict, lang } = useDictionary();
  const router = useRouter();
  const { profile, refreshProfile } = useAuthContext();
  const execute = trpc.capability.execute.useMutation();

  useEffect(() => {
    if (profile?.onboardingComplete) {
      router.push(localePath(lang, "/outfits"));
    }
  }, [profile, router, lang]);

  async function handleComplete(data: OnboardingData) {
    await execute.mutateAsync({
      name: "user.completeOnboarding",
      input: {
        preferences: data.preferences,
        bodyInfo: data.bodyInfo,
        wardrobeGaps: data.wardrobeGaps,
      },
    });

    await refreshProfile();
    router.push(localePath(lang, "/outfits"));
  }

  return (
    <ProtectedRoute>
      <div className="mx-auto max-w-lg px-4 py-6 sm:py-12">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold tracking-tight">{dict.onboarding.title}</h1>
          <p className="text-neutral-500 text-sm mt-1">
            {dict.onboarding.subtitle}
          </p>
        </div>
        <OnboardingForm onComplete={handleComplete} />
      </div>
    </ProtectedRoute>
  );
}
