'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/trpc/client';
import {
  STYLE_KEYWORDS,
  COLOR_OPTIONS,
  COLOR_HEX,
  BODY_TYPES,
  HEIGHT_OPTIONS,
  FIT_PREFERENCES,
  FORMALITY_OPTIONS,
  LIFESTYLE_OPTIONS,
} from '@/lib/onboarding-options';

interface Props {
  lang: string;
}

const STEPS = ['style', 'body', 'lifestyle'] as const;
type Step = (typeof STEPS)[number];

export function OnboardingForm({ lang }: Props) {
  const router = useRouter();
  // tRPC's auto-generated typed sub-routers (trpc.user.completeOnboarding)
  // don't have strongly-typed inputs yet — that's a Phase 8 polish item.
  // Use the generic capability.execute and rely on the capability's Zod
  // schema for validation server-side.
  const completeOnboarding = trpc.capability.execute.useMutation();

  const [step, setStep] = useState<Step>('style');

  // Style
  const [styleKeywords, setStyleKeywords] = useState<string[]>([]);
  const [favoriteColors, setFavoriteColors] = useState<string[]>([]);
  const [avoidColors, setAvoidColors] = useState<string[]>([]);

  // Body
  const [bodyType, setBodyType] = useState('');
  const [height, setHeight] = useState('');
  const [fitPreference, setFitPreference] = useState('');

  // Lifestyle
  const [formality, setFormality] = useState('');
  const [lifestyle, setLifestyle] = useState('');

  const stepIndex = STEPS.indexOf(step);
  const isLast = stepIndex === STEPS.length - 1;

  function toggleArrayItem(arr: string[], item: string, setter: (v: string[]) => void) {
    setter(arr.includes(item) ? arr.filter((i) => i !== item) : [...arr, item]);
  }

  async function handleSubmit() {
    try {
      await completeOnboarding.mutateAsync({
        name: 'user.completeOnboarding',
        input: {
          preferences: {
            styleKeywords,
            favoriteColors,
            avoidColors,
            formality: formality || 'Mixed',
            lifestyle: lifestyle || 'Mixed',
          },
          bodyInfo: {
            bodyType: bodyType || 'Mixed',
            height: height || 'Average',
            fitPreference: fitPreference || 'Relaxed',
          },
        },
      });
      router.push(`/${lang}/wardrobe`);
      router.refresh();
    } catch (err) {
      console.error('completeOnboarding failed:', err);
      alert(err instanceof Error ? err.message : 'Failed to save');
    }
  }

  function next() {
    if (isLast) {
      void handleSubmit();
    } else {
      setStep(STEPS[stepIndex + 1]);
    }
  }

  function back() {
    if (stepIndex > 0) setStep(STEPS[stepIndex - 1]);
  }

  return (
    <div className="max-w-xl mx-auto px-6 py-8 space-y-8">
      {/* Progress bar */}
      <div className="flex gap-2">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i <= stepIndex ? 'bg-stone-700' : 'bg-stone-200'
            }`}
          />
        ))}
      </div>

      {step === 'style' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold mb-1">What&apos;s your style?</h2>
            <p className="text-sm text-stone-500">Select all that resonate.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {STYLE_KEYWORDS.map((kw) => {
              const active = styleKeywords.includes(kw);
              return (
                <button
                  key={kw}
                  type="button"
                  onClick={() => toggleArrayItem(styleKeywords, kw, setStyleKeywords)}
                  className={`px-4 py-2 text-sm transition-colors ${
                    active
                      ? 'bg-stone-700 text-stone-50'
                      : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                  }`}
                >
                  {kw}
                </button>
              );
            })}
          </div>

          <div>
            <p className="text-sm font-medium text-stone-700 mb-2">Colors you love</p>
            <div className="flex flex-wrap gap-2">
              {COLOR_OPTIONS.map((color) => {
                const active = favoriteColors.includes(color);
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => toggleArrayItem(favoriteColors, color, setFavoriteColors)}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs transition-colors ${
                      active
                        ? 'bg-stone-700 text-stone-50'
                        : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                    }`}
                  >
                    <span
                      className="inline-block w-3 h-3 rounded-full border border-stone-300"
                      style={{ background: COLOR_HEX[color] }}
                      aria-hidden
                    />
                    {color}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-stone-700 mb-2">Colors to avoid</p>
            <div className="flex flex-wrap gap-2">
              {COLOR_OPTIONS.map((color) => {
                const active = avoidColors.includes(color);
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => toggleArrayItem(avoidColors, color, setAvoidColors)}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs transition-colors ${
                      active
                        ? 'bg-red-100 text-red-700'
                        : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                    }`}
                  >
                    <span
                      className="inline-block w-3 h-3 rounded-full border border-stone-300"
                      style={{ background: COLOR_HEX[color] }}
                      aria-hidden
                    />
                    {color}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {step === 'body' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold mb-1">About you</h2>
            <p className="text-sm text-stone-500">Helps us suggest fits that flatter.</p>
          </div>

          <RadioGroup
            label="Body type"
            options={BODY_TYPES}
            value={bodyType}
            onChange={setBodyType}
          />
          <RadioGroup
            label="Height"
            options={HEIGHT_OPTIONS}
            value={height}
            onChange={setHeight}
          />
          <RadioGroup
            label="Preferred fit"
            options={FIT_PREFERENCES}
            value={fitPreference}
            onChange={setFitPreference}
          />
        </div>
      )}

      {step === 'lifestyle' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold mb-1">Your lifestyle</h2>
            <p className="text-sm text-stone-500">Style that fits how you actually live.</p>
          </div>

          <RadioGroup
            label="How formal is most of your day?"
            options={FORMALITY_OPTIONS}
            value={formality}
            onChange={setFormality}
          />
          <RadioGroup
            label="Primary context"
            options={LIFESTYLE_OPTIONS}
            value={lifestyle}
            onChange={setLifestyle}
          />
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <button
          type="button"
          onClick={back}
          className={`px-5 py-3 text-sm text-stone-600 hover:text-stone-900 transition-colors ${
            stepIndex === 0 ? 'invisible' : ''
          }`}
        >
          Back
        </button>
        <button
          type="button"
          onClick={next}
          disabled={completeOnboarding.isPending}
          className="px-5 py-3 bg-stone-700 text-stone-50 text-sm font-medium hover:bg-stone-600 transition-colors disabled:opacity-50"
        >
          {completeOnboarding.isPending ? 'Saving…' : isLast ? 'Complete' : 'Next'}
        </button>
      </div>
    </div>
  );
}

function RadioGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="text-sm font-medium text-stone-700 mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const active = value === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={`px-4 py-2 text-sm transition-colors ${
                active
                  ? 'bg-stone-700 text-stone-50'
                  : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}
