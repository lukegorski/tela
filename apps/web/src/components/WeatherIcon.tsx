"use client";

/**
 * Weather icon glyph set. Extracted from the legacy
 * src/components/LocationSettingsContent.tsx (where it was co-located).
 * Used by Navbar, SettingsMenu, LocationSettingsContent.
 *
 * Pixel-perfect: same SVG paths as legacy, byte-for-byte.
 */
export function WeatherIcon({
  iconKey,
  className = "w-5 h-5",
  title,
}: {
  iconKey: string;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      {title && <title>{title}</title>}
      {iconKey === "sun" && (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"
        />
      )}
      {iconKey === "moon" && (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z"
        />
      )}
      {iconKey === "cloud-sun" && (
        <>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 3v1.5M18.364 5.636l-1.06 1.06M21 12h-1.5M15.75 12a3.75 3.75 0 01-3 3.675"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 18.75a4.5 4.5 0 010-9h.2a5.25 5.25 0 0110.1 2.7 3.75 3.75 0 01-.5 7.3H8z"
          />
        </>
      )}
      {iconKey === "cloud-moon" && (
        <>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M20.25 10.5a6.75 6.75 0 01-6.75-6.75c0-.41.036-.81.106-1.2A6.003 6.003 0 009 8.25"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 18.75a4.5 4.5 0 010-9h.2a5.25 5.25 0 0110.1 2.7 3.75 3.75 0 01-.5 7.3H8z"
          />
        </>
      )}
      {iconKey === "cloud" && (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8 18.75a4.5 4.5 0 010-9h.2a5.25 5.25 0 0110.1 2.7 3.75 3.75 0 01-.5 7.3H8z"
        />
      )}
      {(iconKey === "rain" || iconKey === "drizzle") && (
        <>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 15.75a4.5 4.5 0 010-9h.2a5.25 5.25 0 0110.1 2.7 3.75 3.75 0 01-.5 7.3H8z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.5 19.5v1.5M12 19.5v1.5M14.5 19.5v1.5"
          />
        </>
      )}
      {iconKey === "snow" && (
        <>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 15.75a4.5 4.5 0 010-9h.2a5.25 5.25 0 0110.1 2.7 3.75 3.75 0 01-.5 7.3H8z"
          />
          <circle cx="9.5" cy="20" r="0.75" fill="currentColor" stroke="none" />
          <circle cx="12" cy="20" r="0.75" fill="currentColor" stroke="none" />
          <circle cx="14.5" cy="20" r="0.75" fill="currentColor" stroke="none" />
        </>
      )}
      {(iconKey === "thunder" || iconKey === "fog") && (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8 15.75a4.5 4.5 0 010-9h.2a5.25 5.25 0 0110.1 2.7 3.75 3.75 0 01-.5 7.3H8z"
        />
      )}
    </svg>
  );
}
