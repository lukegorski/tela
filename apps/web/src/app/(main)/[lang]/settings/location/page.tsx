"use client";

import Link from "next/link";
import ProtectedRoute from "@/components/ProtectedRoute";
import LocationSettingsContent from "@/components/LocationSettingsContent";
import { useDictionary } from "@/components/DictionaryProvider";
import { localePath } from "@/lib/i18n";
import { usePageTransition } from "@/components/PageTransitionProvider";

export default function LocationSettingsPage() {
  const { dict, lang } = useDictionary();
  const { navigateWithTransition } = usePageTransition();

  return (
    <ProtectedRoute>
      <div className="mx-auto max-w-lg px-4 py-5 sm:py-8">
        <Link
          href={localePath(lang, "/settings")}
          onClick={(e) => {
            e.preventDefault();
            navigateWithTransition(localePath(lang, "/settings"), "right");
          }}
          className="text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 mb-6 flex items-center min-h-[44px] py-2 transition-colors"
          aria-label={dict.common.back}
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </Link>

        <LocationSettingsContent />
      </div>
    </ProtectedRoute>
  );
}
