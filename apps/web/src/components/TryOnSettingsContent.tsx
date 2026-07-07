"use client";

/**
 * Pixel-perfect port of legacy src/components/TryOnSettingsContent.tsx.
 *
 * Visual + behavior parity:
 *   - Header
 *   - Model selection: 3-column grid (Woman, Man, Me-self). Self is
 *     disabled with "Coming soon" badge — same as legacy.
 *   - Background selection: 3-column grid (Neutral, Chic Interior,
 *     Nighttime) with gradient previews.
 *   - Save flow: any change immediately persists via
 *     user.updateTryOnSettings.
 *
 * Data-layer changes vs legacy (no firebase imports):
 *   - Firestore updateDoc → trpc.capability.execute({name:
 *     'user.updateTryOnSettings'}). Same payload (TryOnSettings shape).
 *   - Firebase Storage upload code removed. The Self model is disabled
 *     in the UI (matches legacy "coming soon" pattern), so the
 *     selfPreview / handleSelfPhotoAccept / Storage upload paths were
 *     dead code in legacy too. When Self is later un-disabled, this is
 *     where the Supabase Storage upload + user.updateTryOnSettings
 *     call live.
 */
import { useState } from "react";
import Image from "next/image";
import { useAuthContext } from "@/components/AuthProvider";
import { useDictionary } from "@/components/DictionaryProvider";
import { trpc } from "@/trpc/client";

interface TryOnSettings {
  background: "neutral" | "chic-interior" | "nighttime";
  model: "self" | "model-woman" | "model-man";
  selfPhotoURL: string | null;
}

const DEFAULT_TRYON_SETTINGS: TryOnSettings = {
  background: "neutral",
  model: "model-woman",
  selfPhotoURL: null,
};

const BACKGROUND_OPTIONS: {
  value: TryOnSettings["background"];
  label: string;
  gradient: string;
}[] = [
  {
    value: "neutral",
    label: "Neutral",
    gradient: "bg-gradient-to-br from-neutral-100 to-neutral-200",
  },
  {
    value: "chic-interior",
    label: "Chic Interior",
    gradient: "bg-gradient-to-br from-amber-50 to-stone-200",
  },
  {
    value: "nighttime",
    label: "Nighttime",
    gradient: "bg-gradient-to-br from-indigo-900 to-purple-900",
  },
];

const MODEL_OPTIONS: {
  value: TryOnSettings["model"];
  label: string;
}[] = [
  { value: "model-woman", label: "Woman" },
  { value: "model-man", label: "Man" },
  { value: "self", label: "Me" },
];

const MODEL_PREVIEW_URLS: Record<string, string> = {
  "model-woman": "/models/woman.jpg",
  "model-man": "/models/man.jpg",
};

export default function TryOnSettingsContent() {
  const { dict } = useDictionary();
  const { user, profile, refreshProfile } = useAuthContext();
  const settings = profile?.tryOnSettings ?? DEFAULT_TRYON_SETTINGS;

  const bgLabels: Record<string, string> = {
    neutral: dict.settings.backgroundNeutral,
    "chic-interior": dict.settings.backgroundChicInterior,
    nighttime: dict.settings.backgroundNighttime,
  };
  const modelLabels: Record<string, string> = {
    self: dict.settings.modelMe,
    "model-woman": dict.settings.modelWoman,
    "model-man": dict.settings.modelMan,
  };

  const [saving, setSaving] = useState(false);

  const execute = trpc.capability.execute.useMutation();

  async function updateSettings(partial: Partial<TryOnSettings>) {
    if (!user) return;
    setSaving(true);
    try {
      const updated = { ...settings, ...partial };
      await execute.mutateAsync({
        name: "user.updateTryOnSettings",
        input: updated,
      });
      await refreshProfile();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <h1 className="text-sm font-semibold tracking-widest uppercase mb-6">
        {dict.settings.tryOnSettings}
      </h1>

      {/* Model Selection */}
      <section className="mb-8">
        <h2 className="text-sm font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-3">
          {dict.settings.tryOnModel}
        </h2>

        <div className="grid grid-cols-3 gap-3">
          {MODEL_OPTIONS.map((opt) => {
            const isSelected = settings.model === opt.value;
            const isSelf = opt.value === "self";

            return (
              <button
                key={opt.value}
                onClick={() => {
                  if (isSelf) return;
                  updateSettings({ model: opt.value });
                }}
                disabled={saving || isSelf}
                className={`rounded-2xl overflow-hidden border-2 transition-colors ${
                  isSelf
                    ? "border-stone-200 dark:border-neutral-600 opacity-60 cursor-default"
                    : isSelected
                      ? "border-stone-700 dark:border-stone-300"
                      : "border-stone-200 dark:border-neutral-600"
                }`}
              >
                <div
                  className={`aspect-[3/4] relative flex items-center justify-center ${
                    isSelf ? "bg-white dark:bg-neutral-900" : "bg-neutral-100 dark:bg-neutral-800"
                  }`}
                >
                  {isSelf ? (
                    <>
                      <span className="absolute top-2 inset-x-0 text-center text-[10px] font-medium text-stone-400 dark:text-stone-500 uppercase tracking-wide">
                        {dict.settings.comingSoon}
                      </span>
                      <div className="text-stone-300 dark:text-stone-600">
                        <svg
                          className="w-8 h-8"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"
                          />
                        </svg>
                      </div>
                    </>
                  ) : (
                    MODEL_PREVIEW_URLS[opt.value] && (
                      <Image
                        src={MODEL_PREVIEW_URLS[opt.value]}
                        alt={opt.label}
                        fill
                        sizes="33vw"
                        preload
                        className="object-cover"
                      />
                    )
                  )}
                </div>
                <div className="py-2 text-center">
                  <span
                    className={`text-xs font-medium ${
                      isSelected ? "text-stone-700 dark:text-stone-300" : "text-stone-400 dark:text-stone-500"
                    }`}
                  >
                    {modelLabels[opt.value]}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

      </section>

      {/* Background Selection */}
      <section className="mb-8">
        <h2 className="text-sm font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-3">
          {dict.settings.tryOnBackground}
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {BACKGROUND_OPTIONS.map((opt) => {
            const isSelected = settings.background === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => updateSettings({ background: opt.value })}
                disabled={saving}
                className={`rounded-2xl overflow-hidden border-2 transition-colors ${
                  isSelected
                    ? "border-stone-700 dark:border-stone-300"
                    : "border-stone-200 dark:border-neutral-600"
                }`}
              >
                <div className={`aspect-[3/4] ${opt.gradient}`} />
                <div className="py-2 text-center">
                  <span
                    className={`text-xs font-medium ${
                      isSelected ? "text-stone-700 dark:text-stone-300" : "text-stone-400 dark:text-stone-500"
                    }`}
                  >
                    {bgLabels[opt.value]}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}
