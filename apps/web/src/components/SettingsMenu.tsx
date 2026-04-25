"use client";

/**
 * Pixel-perfect port of legacy src/components/SettingsMenu.tsx.
 *
 * Visual + behavior parity:
 *   - Greeting "Hi" + first name in upper-left
 *   - Theme toggle icon + sign-out icon in upper-right (with confirm step
 *     for sign-out and inline 3-state picker for theme)
 *   - Optional weather strip below greeting (city · temp · icon) when the
 *     user has a saved location
 *   - 3 menu rows: Location, Try-on, Language (drilldown on mobile,
 *     inline view-swap on desktop)
 *
 * Data-layer changes vs legacy (no firebase imports):
 *   - useAuthContext().user shape — `displayName` replaces legacy
 *     `displayName` (same name, same access path).
 *   - profile.location read directly from useAuthContext (same as legacy
 *     once we extended AuthProfile to include the full location object).
 *   - Weather still uses the public Open-Meteo API (no key) so the
 *     fetchWeather call is unchanged.
 */
import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuthContext } from "@/components/AuthProvider";
import { useDictionary } from "@/components/DictionaryProvider";
import { useTheme } from "@/components/ThemeProvider";
import { localePath } from "@/lib/i18n";
import { usePageTransition } from "@/components/PageTransitionProvider";
import { fetchWeather, getWeatherIconKey, tempDisplay } from "@/lib/weather";
import type { WeatherContext } from "@/lib/weather";
import { WeatherIcon } from "@/components/WeatherIcon";

interface SettingsMenuProps {
  onNavigate?: () => void;
  onClose?: () => void;
  onMenuSelect?: (view: string) => void;
}

export default function SettingsMenu({
  onNavigate,
  onClose,
  onMenuSelect,
}: SettingsMenuProps) {
  const { user, profile, signOut } = useAuthContext();
  const { dict, lang } = useDictionary();
  const { navigateWithTransition } = usePageTransition();
  const { theme, setTheme } = useTheme();
  const [confirming, setConfirming] = useState(false);
  const [themePicking, setThemePicking] = useState(false);
  const [weather, setWeather] = useState<WeatherContext | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  const location = profile?.location;

  useEffect(() => {
    if (!location) return;
    setWeatherLoading(true);
    fetchWeather(location.lat, location.lon, location.timezone)
      .then(setWeather)
      .catch(() => {})
      .finally(() => setWeatherLoading(false));
  }, [location]);

  if (!user) return null;

  const firstName = profile?.displayName
    ? profile.displayName.split(" ")[0]
    : "";

  const menuItems = [
    {
      key: "location",
      href: localePath(lang, "/settings/location"),
      label: dict.settings.location,
    },
    {
      key: "try-on",
      href: localePath(lang, "/settings/try-on"),
      label: dict.settings.tryOnSettings,
    },
    {
      key: "language",
      href: localePath(lang, "/settings/language"),
      label: dict.settings.language,
    },
  ];

  return (
    <div className="flex flex-col min-h-[calc(100dvh-4rem)] sm:min-h-0 relative">
      {/* Dismiss overlay — catches taps outside sign-out or theme confirmation */}
      {(confirming || themePicking) && (
        <div
          className="absolute inset-0 z-10"
          onClick={() => { setConfirming(false); setThemePicking(false); }}
        />
      )}
      {/* Greeting — same positioning/styling as page headers */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <h1 className="text-sm font-semibold tracking-widest uppercase text-neutral-400 dark:text-neutral-500">
          {dict.settings.greeting}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <div style={{ minHeight: 36 }} className={`flex items-center gap-2${confirming || themePicking ? " relative z-20" : ""}`}>
          {confirming ? (
            <>
              <button
                onClick={() => {
                  onNavigate?.();
                  onClose?.();
                  signOut();
                }}
                className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400"
              >
                {dict.common.signOut}
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="px-3 py-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400"
              >
                {dict.common.cancel}
              </button>
            </>
          ) : themePicking ? (
            <>
              {(["auto", "light", "dark"] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => {
                    setTheme(opt);
                    setThemePicking(false);
                  }}
                  className={`px-3 py-1.5 text-xs font-medium ${
                    theme === opt
                      ? "text-neutral-900 dark:text-neutral-100"
                      : "text-neutral-400 dark:text-neutral-500"
                  }`}
                >
                  {opt === "auto"
                    ? (dict.settings.themeAuto ?? "Auto")
                    : opt === "light"
                      ? (dict.settings.themeLight ?? "Light")
                      : (dict.settings.themeDark ?? "Dark")}
                </button>
              ))}
            </>
          ) : (
            <>
              {/* Theme toggle icon */}
              <button
                onClick={() => setThemePicking(true)}
                className={onClose ? "p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors" : "p-1"}
                aria-label={dict.settings.theme ?? "Appearance"}
              >
                <svg className={`w-5 h-5 ${onClose ? "text-neutral-500 dark:text-neutral-400" : "text-neutral-400 dark:text-neutral-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  {/* Sun (light mode) */}
                  <path className="block dark:hidden" strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                  {/* Moon (dark mode) */}
                  <path className="hidden dark:block" strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
                </svg>
              </button>
              {/* Sign-out icon */}
              <button
                onClick={() => setConfirming(true)}
                className={onClose ? "p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors" : "p-1"}
                aria-label={dict.common.signOut}
              >
                <svg className={`w-5 h-5 ${onClose ? "text-neutral-500 dark:text-neutral-400" : "text-neutral-400 dark:text-neutral-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Weather display */}
      {location && weatherLoading && (
        <div className="px-4 -mt-1 flex items-center gap-1.5">
          <div className="h-3 w-20 bg-neutral-200 dark:bg-neutral-700 rounded-sm animate-pulse" />
          <div className="h-3 w-8 bg-neutral-200 dark:bg-neutral-700 rounded-sm animate-pulse" />
          <div className="h-3 w-3 bg-neutral-200 dark:bg-neutral-700 rounded-sm animate-pulse" />
        </div>
      )}
      {location && !weatherLoading && weather && (
        <div className="px-4 -mt-1 flex items-center gap-1.5 text-xs text-neutral-400 dark:text-neutral-500">
          <span>{location.city}</span>
          <span>·</span>
          <span>{tempDisplay(weather.tempC, location.tempUnit)}</span>
          <span>·</span>
          <WeatherIcon
            iconKey={getWeatherIconKey(weather.conditionCode, weather.isDay)}
            className="w-3.5 h-3.5"
          />
        </div>
      )}

      {/* Menu rows */}
      <nav className="mt-8">
        {menuItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={(e) => {
              if (onMenuSelect) {
                // Desktop panel — switch view inline
                e.preventDefault();
                onMenuSelect(item.key);
              } else {
                // Mobile — drill-down transition (slide in from right)
                e.preventDefault();
                navigateWithTransition(item.href, "left");
              }
            }}
            className="flex items-center justify-between px-4 py-4 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800"
          >
            <span className="text-sm font-medium uppercase tracking-wide">
              {item.label}
            </span>
            <svg
              className="w-5 h-5 text-neutral-400 dark:text-neutral-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </Link>
        ))}
      </nav>

    </div>
  );
}
