"use client";

/**
 * Pixel-perfect port of legacy src/components/Navbar.tsx.
 *
 * Visual + behavior parity:
 *   - Desktop only (sm:block hidden); mobile uses MobileNav
 *   - Logo (custom SVG) on the left, links to /outfits
 *   - 3 nav links centered: Outfits / Pieces / Lookbook
 *   - Right side: weather strip (city + temp + icon) when location set;
 *     avatar button that opens settings panel
 *   - Settings panel slides in from the right, supports menu + 4
 *     sub-views (try-on, language, theme, location), backdrop click /
 *     escape closes
 *   - Auto-closes panel on route change
 *
 * Data-layer changes vs legacy (no firebase imports):
 *   - useAuthContext().user.photoURL → user.avatarUrl (Supabase user
 *     shape; same role).
 *   - Everything else byte-for-byte from legacy.
 */
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

import { usePathname } from "next/navigation";
import { useAuthContext } from "@/components/AuthProvider";
import { useDictionary } from "@/components/DictionaryProvider";
import { localePath } from "@/lib/i18n";
import SettingsMenu from "@/components/SettingsMenu";
import TryOnSettingsContent from "@/components/TryOnSettingsContent";
import LanguageSettingsContent from "@/components/LanguageSettingsContent";
import ThemeSettingsContent from "@/components/ThemeSettingsContent";
import LocationSettingsContent from "@/components/LocationSettingsContent";
import { fetchWeather, getWeatherIconKey, tempDisplay } from "@/lib/weather";
import type { WeatherContext } from "@/lib/weather";
import { WeatherIcon } from "@/components/WeatherIcon";

type PanelView = "menu" | "try-on" | "language" | "theme" | "location";

export default function Navbar() {
  const { user, profile } = useAuthContext();
  const { dict, lang } = useDictionary();
  const pathname = usePathname();

  const location = profile?.location;
  const [navWeather, setNavWeather] = useState<WeatherContext | null>(null);
  const [navWeatherLoading, setNavWeatherLoading] = useState(false);

  useEffect(() => {
    if (!location) return;
    setNavWeatherLoading(true);
    fetchWeather(location.lat, location.lon, location.timezone)
      .then(setNavWeather)
      .catch(() => {})
      .finally(() => setNavWeatherLoading(false));
  }, [location]);

  const links = [
    { href: localePath(lang, "/outfits"), label: dict.nav.myOutfits },
    { href: localePath(lang, "/wardrobe"), label: dict.nav.pieces },
    { href: localePath(lang, "/lookbook"), label: dict.nav.lookbook },
  ];

  const [avatarError, setAvatarError] = useState(false);
  const [panelVisible, setPanelVisible] = useState(false);
  const [panelClosing, setPanelClosing] = useState(false);
  const [panelView, setPanelView] = useState<PanelView>("menu");
  const [panelDirection, setPanelDirection] = useState<"forward" | "backward">("forward");
  const [panelTransitionKey, setPanelTransitionKey] = useState(0);

  // Animated close (backdrop/X/escape)
  const animateClose = useCallback(() => {
    setPanelClosing(true);
    setTimeout(() => {
      setPanelVisible(false);
      setPanelClosing(false);
      setPanelView("menu");
    }, 450);
  }, []);

  // Instant close (navigation)
  const instantClose = useCallback(() => {
    setPanelVisible(false);
    setPanelClosing(false);
    setPanelView("menu");
  }, []);

  // Open panel always starts at menu
  const openPanel = useCallback(() => {
    setPanelView("menu");
    setPanelVisible(true);
  }, []);

  // Close panel on route change
  useEffect(() => {
    instantClose();
  }, [pathname, instantClose]);

  // Lock body scroll when panel is open
  useEffect(() => {
    if (panelVisible) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [panelVisible]);

  // Close on escape key
  useEffect(() => {
    if (!panelVisible) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") animateClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [panelVisible, animateClose]);

  if (!user) return <div className="hidden sm:block h-14" />;

  const showPhoto = user.avatarUrl && !avatarError;

  return (
    <>
      <nav className="hidden sm:block border-b border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900">
        <div className="px-4 flex items-center h-14">
          {/* Left — logo */}
          <div className="flex-1">
            <Link href={localePath(lang, "/outfits")}>
              <svg
                className="h-6 w-auto text-black dark:text-white"
                viewBox="0 0 42.205505 45.859783"
                aria-label="tela"
              >
                <g transform="translate(-24.510757,-166.40873)">
                  <path
                    fill="currentColor"
                    d="m 25.313181,211.73859 c -0.29219,-0.29219 -0.630916,-0.84526 -0.752724,-1.22905 -0.121809,-0.38378 -0.0119,-1.1369 0.244241,-1.6736 0.347231,-0.72756 0.866017,-1.07248 2.039193,-1.35575 1.373339,-0.33161 1.655526,-0.56808 2.21849,-1.85908 0.354755,-0.81353 1.178574,-3.81756 1.830709,-6.67562 0.652135,-2.85807 1.591939,-6.27282 2.088452,-7.58834 0.496514,-1.31552 1.477573,-3.25786 2.180131,-4.31631 0.702558,-1.05845 1.884499,-2.4053 2.626536,-2.993 0.742036,-0.58771 1.917896,-1.30619 2.613023,-1.59663 1.042264,-0.43549 1.504575,-1.00677 2.636712,-3.2582 0.755066,-1.50156 2.121348,-3.72571 3.036183,-4.94255 0.914834,-1.21685 2.66003,-2.92367 3.878212,-3.79295 1.218182,-0.86928 3.067475,-1.95643 4.109538,-2.41591 1.042064,-0.45947 2.735913,-1.01483 3.764109,-1.23414 1.028196,-0.2193 3.059474,-0.39873 4.513952,-0.39873 2.337375,0 2.74507,0.10056 3.510414,0.86591 0.476249,0.47625 0.865909,1.16921 0.865909,1.53992 0,0.37071 -0.312124,1.07082 -0.693608,1.5558 -0.633766,0.8057 -0.99139,0.89732 -4.145139,1.06196 -2.359371,0.12317 -4.103852,0.42928 -5.513048,0.9674 -1.133835,0.43296 -2.869403,1.44578 -3.856819,2.2507 -0.987415,0.80492 -2.48067,2.465 -3.318343,3.68907 -0.837674,1.22408 -1.523043,2.43325 -1.523043,2.68705 0,0.26041 0.576374,0.55372 1.322917,0.67323 0.727604,0.11647 2.177779,0.63789 3.222612,1.1587 1.044832,0.52081 2.711707,1.76112 3.704166,2.75623 0.992459,0.99512 2.274909,2.75618 2.849888,3.91347 0.911549,1.83473 1.045459,2.48815 1.04574,5.10278 2.48e-4,2.30538 -0.173003,3.37995 -0.749398,4.64809 -0.412346,0.90721 -1.420901,2.37762 -2.241234,3.26757 -1.128171,1.22392 -1.960558,1.75446 -3.416917,2.17783 -1.209337,0.35157 -2.47093,0.47793 -3.392253,0.33977 -0.806767,-0.12099 -2.300897,-0.69632 -3.320287,-1.27851 -1.064418,-0.60792 -2.373183,-1.76813 -3.074342,-2.7254 -0.671497,-0.91676 -1.558416,-2.61935 -1.970929,-3.78351 -0.473862,-1.3373 -0.819952,-3.38314 -0.939937,-5.55625 -0.104452,-1.89178 -0.30532,-3.43959 -0.446374,-3.43959 -0.141053,0 -0.735425,0.91281 -1.320826,2.02847 -0.585401,1.11566 -1.327073,2.8391 -1.64816,3.82985 -0.321087,0.99076 -1.119433,4.0963 -1.774101,6.9012 -0.654669,2.80491 -1.527894,5.80429 -1.940499,6.6653 -0.412605,0.861 -1.038078,1.91018 -1.389939,2.33151 -0.351861,0.42133 -1.180021,1.09542 -1.840354,1.49799 -0.761923,0.4645 -1.803672,0.73242 -2.851102,0.73325 -1.001163,8e-4 -1.8595,-0.20768 -2.181751,-0.52993 z m 27.054439,-11.8523 c 0.469702,-0.21401 1.184885,-0.97784 1.589297,-1.69739 0.404412,-0.71955 0.83634,-1.94019 0.95984,-2.71252 0.123501,-0.77233 0.05309,-2.04099 -0.156478,-2.81925 -0.209563,-0.77826 -0.921676,-2.04665 -1.582472,-2.81864 -0.660796,-0.77199 -1.972782,-1.81811 -2.915524,-2.3247 -0.942743,-0.50659 -2.249846,-1.03444 -2.904674,-1.173 -0.842013,-0.17816 -1.279399,-0.11177 -1.493904,0.22676 -0.166819,0.26327 -0.305737,1.75501 -0.308709,3.31498 -0.003,1.55996 0.239431,3.77627 0.53867,4.92513 0.29924,1.14886 0.954738,2.62724 1.456663,3.2853 0.501925,0.65806 1.40803,1.4121 2.013567,1.67565 0.605537,0.26354 1.291944,0.48538 1.525349,0.49298 0.233405,0.008 0.808674,-0.16129 1.278375,-0.3753 z"
                  />
                </g>
              </svg>
            </Link>
          </div>

          {/* Center — nav links */}
          <div className="flex items-center gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 text-sm font-semibold tracking-widest uppercase transition-colors ${
                  pathname === link.href
                    ? "text-stone-700 dark:text-stone-300"
                    : "text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-300"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Right — weather + avatar button opens settings panel */}
          <div className="flex-1 flex justify-end items-center gap-3">
            {/* Weather in navbar */}
            {location && navWeatherLoading && (
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-14 bg-neutral-200 dark:bg-neutral-700 rounded-sm animate-pulse" />
                <div className="h-3 w-7 bg-neutral-200 dark:bg-neutral-700 rounded-sm animate-pulse" />
              </div>
            )}
            {location && !navWeatherLoading && navWeather && (
              <div className="flex items-center gap-1.5 text-xs text-neutral-400 dark:text-neutral-500 cursor-default">
                <span title={location.country ? `${location.city}, ${location.country}` : location.city}>{location.city}</span>
                <span>·</span>
                <span title={`Feels like ${tempDisplay(navWeather.feelsLikeC, location.tempUnit)}`}>{tempDisplay(navWeather.tempC, location.tempUnit)}</span>
                <WeatherIcon
                  iconKey={getWeatherIconKey(navWeather.conditionCode, navWeather.isDay)}
                  className="w-3.5 h-3.5"
                  title={navWeather.conditionLabel}
                />
              </div>
            )}
            <button
              onClick={openPanel}
              className="rounded-full overflow-hidden focus:outline-none focus:ring-2 focus:ring-neutral-300"
              aria-label={dict.nav.me}
            >
              {showPhoto ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={user.avatarUrl!}
                  alt=""
                  className="w-8 h-8 rounded-full object-cover"
                  onError={() => setAvatarError(true)}
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center">
                  <svg
                    className="w-4 h-4 text-neutral-500 dark:text-neutral-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                    />
                  </svg>
                </div>
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* Settings right panel overlay */}
      {panelVisible && (
        <div className="hidden sm:block fixed inset-0 z-[60]">
          {/* Backdrop */}
          <div
            className={`absolute inset-0 bg-black/40 transition-opacity duration-[450ms] ${
              panelClosing
                ? "opacity-0"
                : "opacity-100 animate-[fadeIn_450ms_ease-out]"
            }`}
            onClick={animateClose}
          />

          {/* Right panel */}
          <div
            className={`absolute inset-y-0 right-0 w-[420px] bg-white dark:bg-neutral-900 overflow-hidden transition-transform duration-[450ms] ease-out ${
              panelClosing
                ? "translate-x-full"
                : "animate-[slideRight_450ms_ease-out]"
            }`}
          >
            <div
              key={panelTransitionKey}
              className={`h-full overflow-y-auto ${
                panelDirection === "forward"
                  ? "panel-slide-forward"
                  : "panel-slide-backward"
              }`}
            >
              {panelView === "menu" ? (
                <SettingsMenu
                  onClose={animateClose}
                  onMenuSelect={(view) => {
                    setPanelDirection("forward");
                    setPanelView(view as PanelView);
                    setPanelTransitionKey((k) => k + 1);
                  }}
                />
              ) : (
                <>
                  {/* Subview header — back + close */}
                  <div className="flex items-center justify-between px-4 pt-4 pb-3">
                    <button
                      onClick={() => {
                        setPanelDirection("backward");
                        setPanelView("menu");
                        setPanelTransitionKey((k) => k + 1);
                      }}
                      className="flex items-center text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 min-h-[44px] py-2 transition-colors"
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
                    </button>
                    <button
                      onClick={animateClose}
                      className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                    >
                      <svg
                        className="w-5 h-5 text-neutral-500 dark:text-neutral-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>

                  {/* Subview content */}
                  <div className="px-4 pb-4">
                    {panelView === "try-on" ? (
                      <TryOnSettingsContent />
                    ) : panelView === "theme" ? (
                      <ThemeSettingsContent />
                    ) : panelView === "location" ? (
                      <LocationSettingsContent />
                    ) : (
                      <LanguageSettingsContent />
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
