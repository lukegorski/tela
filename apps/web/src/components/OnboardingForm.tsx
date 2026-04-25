"use client";

/**
 * Pixel-perfect port of legacy src/components/OnboardingForm.tsx.
 *
 * 4-step style quiz:
 *   1. Style — STYLE_KEYWORDS (multi-select), COLOR_OPTIONS (favorites
 *      + avoid)
 *   2. Body — BODY_TYPES, HEIGHT_OPTIONS, FIT_PREFERENCES (single-select)
 *   3. Lifestyle — FORMALITY_OPTIONS, LIFESTYLE_OPTIONS (single-select)
 *   4. Wardrobe gaps — free-text textarea (one per line → string[])
 *
 * Visual + behavior parity:
 *   - Progress bar at top (4 segments)
 *   - Back/Next buttons; final step shows "Complete" instead of Next
 *   - All button styles + spacing identical to legacy
 *
 * Data-layer changes vs legacy (no firebase imports):
 *   - Constants imported from @/lib/onboarding-options (our location for
 *     the same arrays the legacy app stored at @/lib/types).
 *   - The submission goes to the parent via onComplete(data); the parent
 *     calls user.completeOnboarding via tRPC (new architecture's
 *     equivalent of legacy's direct Firestore updateDoc on users/{uid}).
 */
import { useState } from "react";
import {
  STYLE_KEYWORDS,
  COLOR_OPTIONS,
  BODY_TYPES,
  HEIGHT_OPTIONS,
  FIT_PREFERENCES,
  FORMALITY_OPTIONS,
  LIFESTYLE_OPTIONS,
} from "@/lib/onboarding-options";
import ColorSwatch from "@/components/ColorSwatch";
import { useDictionary } from "@/components/DictionaryProvider";

interface OnboardingFormProps {
  onComplete: (data: OnboardingData) => Promise<void>;
}

export interface OnboardingData {
  preferences: {
    styleKeywords: string[];
    favoriteColors: string[];
    avoidColors: string[];
    formality: string;
    lifestyle: string;
  };
  bodyInfo: {
    bodyType: string;
    height: string;
    fitPreference: string;
  };
  wardrobeGaps: string[];
}

export default function OnboardingForm({ onComplete }: OnboardingFormProps) {
  const { dict } = useDictionary();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Step 1: Style
  const [styleKeywords, setStyleKeywords] = useState<string[]>([]);
  const [favoriteColors, setFavoriteColors] = useState<string[]>([]);
  const [avoidColors, setAvoidColors] = useState<string[]>([]);

  // Step 2: Body
  const [bodyType, setBodyType] = useState("");
  const [height, setHeight] = useState("");
  const [fitPreference, setFitPreference] = useState("");

  // Step 3: Lifestyle
  const [formality, setFormality] = useState("");
  const [lifestyle, setLifestyle] = useState("");

  // Step 4: Gaps
  const [gaps, setGaps] = useState("");

  function toggleArrayItem(arr: string[], item: string, setter: (v: string[]) => void) {
    if (arr.includes(item)) {
      setter(arr.filter((i) => i !== item));
    } else {
      setter([...arr, item]);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    await onComplete({
      preferences: {
        styleKeywords,
        favoriteColors,
        avoidColors,
        formality,
        lifestyle,
      },
      bodyInfo: {
        bodyType,
        height,
        fitPreference,
      },
      wardrobeGaps: gaps.split("\n").filter(Boolean),
    });
  }

  const steps = [
    // Step 1: Style
    <div key="style" className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">{dict.onboarding.whatsYourStyle}</h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">{dict.onboarding.selectAllResonating}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {STYLE_KEYWORDS.map((kw) => (
          <button
            key={kw}
            type="button"
            onClick={() => toggleArrayItem(styleKeywords, kw, setStyleKeywords)}
            className={`px-4 py-2 rounded-none text-sm transition-colors ${
              styleKeywords.includes(kw)
                ? "bg-stone-700 text-stone-50 dark:bg-stone-300 dark:text-stone-900"
                : "bg-stone-100 text-stone-500 hover:bg-stone-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700"
            }`}
          >
            {dict.constants.styleKeywords[kw as keyof typeof dict.constants.styleKeywords] ?? kw}
          </button>
        ))}
      </div>

      <div>
        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">{dict.onboarding.colorsYouLove}</p>
        <div className="flex flex-wrap gap-2">
          {COLOR_OPTIONS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => toggleArrayItem(favoriteColors, color, setFavoriteColors)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-none text-xs transition-colors ${
                favoriteColors.includes(color)
                  ? "bg-stone-700 text-stone-50 dark:bg-stone-300 dark:text-stone-900"
                  : "bg-stone-100 text-stone-500 hover:bg-stone-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700"
              }`}
            >
              <ColorSwatch colorName={color} size="sm" showLabel={false} />
              {dict.constants.colorOptions[color as keyof typeof dict.constants.colorOptions] ?? color}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">{dict.onboarding.colorsToAvoid}</p>
        <div className="flex flex-wrap gap-2">
          {COLOR_OPTIONS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => toggleArrayItem(avoidColors, color, setAvoidColors)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-none text-xs transition-colors ${
                avoidColors.includes(color)
                  ? "bg-red-100 text-red-700"
                  : "bg-stone-100 text-stone-500 hover:bg-stone-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700"
              }`}
            >
              <ColorSwatch colorName={color} size="sm" showLabel={false} />
              {dict.constants.colorOptions[color as keyof typeof dict.constants.colorOptions] ?? color}
            </button>
          ))}
        </div>
      </div>
    </div>,

    // Step 2: Body
    <div key="body" className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">{dict.onboarding.aboutYou}</h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {dict.onboarding.helpsFitFlatter}
        </p>
      </div>

      <div>
        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">{dict.onboarding.bodyType}</p>
        <div className="flex flex-wrap gap-2">
          {BODY_TYPES.map((bt) => (
            <button
              key={bt}
              type="button"
              onClick={() => setBodyType(bt)}
              className={`px-4 py-2 rounded-none text-sm transition-colors ${
                bodyType === bt
                  ? "bg-stone-700 text-stone-50 dark:bg-stone-300 dark:text-stone-900"
                  : "bg-stone-100 text-stone-500 hover:bg-stone-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700"
              }`}
            >
              {dict.constants.bodyTypes[bt as keyof typeof dict.constants.bodyTypes] ?? bt}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">{dict.onboarding.height}</p>
        <div className="flex flex-wrap gap-2">
          {HEIGHT_OPTIONS.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setHeight(h)}
              className={`px-4 py-2 rounded-none text-sm transition-colors ${
                height === h
                  ? "bg-stone-700 text-stone-50 dark:bg-stone-300 dark:text-stone-900"
                  : "bg-stone-100 text-stone-500 hover:bg-stone-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700"
              }`}
            >
              {dict.constants.heightOptions[h as keyof typeof dict.constants.heightOptions] ?? h}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
          {dict.onboarding.preferredFit}
        </p>
        <div className="flex flex-wrap gap-2">
          {FIT_PREFERENCES.map((fp) => (
            <button
              key={fp}
              type="button"
              onClick={() => setFitPreference(fp)}
              className={`px-4 py-2 rounded-none text-sm transition-colors ${
                fitPreference === fp
                  ? "bg-stone-700 text-stone-50 dark:bg-stone-300 dark:text-stone-900"
                  : "bg-stone-100 text-stone-500 hover:bg-stone-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700"
              }`}
            >
              {dict.constants.fitPreferences[fp as keyof typeof dict.constants.fitPreferences] ?? fp}
            </button>
          ))}
        </div>
      </div>
    </div>,

    // Step 3: Lifestyle
    <div key="lifestyle" className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">{dict.onboarding.yourLifestyle}</h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {dict.onboarding.styleForLife}
        </p>
      </div>

      <div>
        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
          {dict.onboarding.howFormal}
        </p>
        <div className="flex flex-wrap gap-2">
          {FORMALITY_OPTIONS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFormality(f)}
              className={`px-4 py-2 rounded-none text-sm transition-colors ${
                formality === f
                  ? "bg-stone-700 text-stone-50 dark:bg-stone-300 dark:text-stone-900"
                  : "bg-stone-100 text-stone-500 hover:bg-stone-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700"
              }`}
            >
              {dict.constants.formalityOptions[f as keyof typeof dict.constants.formalityOptions] ?? f}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
          {dict.onboarding.primaryContext}
        </p>
        <div className="flex flex-wrap gap-2">
          {LIFESTYLE_OPTIONS.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLifestyle(l)}
              className={`px-4 py-2 rounded-none text-sm transition-colors ${
                lifestyle === l
                  ? "bg-stone-700 text-stone-50 dark:bg-stone-300 dark:text-stone-900"
                  : "bg-stone-100 text-stone-500 hover:bg-stone-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700"
              }`}
            >
              {dict.constants.lifestyleOptions[l as keyof typeof dict.constants.lifestyleOptions] ?? l}
            </button>
          ))}
        </div>
      </div>
    </div>,

    // Step 4: Gaps
    <div key="gaps" className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">{dict.onboarding.wardrobeGaps}</h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {dict.onboarding.whatsGapsPrompt}
        </p>
      </div>
      <textarea
        value={gaps}
        onChange={(e) => setGaps(e.target.value)}
        placeholder={dict.onboarding.gapsPlaceholder}
        rows={5}
        className="w-full px-4 py-3 border border-neutral-300 dark:border-neutral-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-100 focus:border-transparent resize-none text-sm dark:bg-neutral-800 dark:text-neutral-100"
      />
    </div>,
  ];

  return (
    <div>
      {/* Progress bar */}
      <div className="flex gap-2 mb-8">
        {steps.map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i <= step ? "bg-stone-700 dark:bg-stone-300" : "bg-stone-200 dark:bg-neutral-700"
            }`}
          />
        ))}
      </div>

      {steps[step]}

      {/* Navigation */}
      <div className="flex justify-between mt-8">
        <button
          type="button"
          onClick={() => setStep((s) => s - 1)}
          className={`px-5 py-3 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors ${
            step === 0 ? "invisible" : ""
          }`}
        >
          {dict.common.back}
        </button>
        {step < steps.length - 1 ? (
          <button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            className="px-5 py-3 bg-stone-700 text-stone-50 dark:bg-stone-300 dark:text-stone-900 rounded-xl text-sm font-medium hover:bg-stone-600 dark:hover:bg-stone-400 transition-colors"
          >
            {dict.common.next}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="px-5 py-3 bg-stone-700 text-stone-50 dark:bg-stone-300 dark:text-stone-900 rounded-xl text-sm font-medium hover:bg-stone-600 dark:hover:bg-stone-400 transition-colors disabled:opacity-50"
          >
            {submitting ? dict.common.saving : dict.common.complete}
          </button>
        )}
      </div>
    </div>
  );
}
