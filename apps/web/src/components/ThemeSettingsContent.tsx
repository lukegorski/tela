"use client";

import { useTheme } from "@/components/ThemeProvider";
import { useDictionary } from "@/components/DictionaryProvider";

const THEME_OPTIONS = [
  { value: "auto" as const, icon: "auto" },
  { value: "light" as const, icon: "light" },
  { value: "dark" as const, icon: "dark" },
] as const;

export default function ThemeSettingsContent() {
  const { theme, setTheme } = useTheme();
  const { dict } = useDictionary();

  const labels: Record<string, string> = {
    auto: dict.settings.themeAuto ?? "Auto",
    light: dict.settings.themeLight ?? "Light",
    dark: dict.settings.themeDark ?? "Dark",
  };

  return (
    <>
      <h1 className="text-sm font-semibold tracking-widest uppercase mb-6">
        {dict.settings.theme ?? "Appearance"}
      </h1>

      <div className="grid grid-cols-3 gap-3">
        {THEME_OPTIONS.map((opt) => {
          const isSelected = theme === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              className={`rounded-2xl overflow-hidden border-2 transition-colors ${
                isSelected
                  ? "border-stone-700 dark:border-stone-300"
                  : "border-stone-200 dark:border-neutral-600"
              }`}
            >
              <div
                className={`aspect-[3/4] flex items-center justify-center ${
                  opt.value === "dark"
                    ? "bg-neutral-900"
                    : opt.value === "light"
                      ? "bg-white border-b border-neutral-100 dark:border-neutral-700"
                      : "bg-gradient-to-b from-white to-neutral-900"
                }`}
              >
                <svg
                  className={`w-8 h-8 ${
                    opt.value === "dark"
                      ? "text-neutral-400"
                      : opt.value === "light"
                        ? "text-neutral-500"
                        : "text-neutral-500"
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  {opt.value === "light" ? (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"
                    />
                  ) : opt.value === "dark" ? (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z"
                    />
                  ) : (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42"
                    />
                  )}
                </svg>
              </div>
              <div className="py-2 text-center">
                <span
                  className={`text-xs font-medium ${
                    isSelected
                      ? "text-stone-700 dark:text-stone-300"
                      : "text-stone-400 dark:text-stone-500"
                  }`}
                >
                  {labels[opt.value]}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}
