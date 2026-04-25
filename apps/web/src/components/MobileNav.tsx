"use client";

/**
 * Pixel-perfect port of legacy src/components/MobileNav.tsx.
 *
 * Visual + behavior parity:
 *   - Bottom tab bar shown only on mobile (sm:hidden)
 *   - 4 main tabs (Pieces, Outfits, Tela/chat, Lookbook) + Me (avatar
 *     → /settings)
 *   - Active tab uses stone-700/300; inactive stone-400/500
 *   - pb-safe to clear iPhone home indicator
 *
 * Data-layer changes vs legacy (no firebase imports):
 *   - useAuthContext().user.photoURL → user.avatarUrl (Supabase shape).
 *   - Otherwise byte-for-byte from legacy.
 */
import { useState } from "react";
import Link from "next/link";

import { usePathname } from "next/navigation";
import { useAuthContext } from "@/components/AuthProvider";
import { useDictionary } from "@/components/DictionaryProvider";
import { localePath } from "@/lib/i18n";

export default function MobileNav() {
  const { user } = useAuthContext();
  const { dict, lang } = useDictionary();
  const pathname = usePathname();

  const tabs: Array<{ href: string; label: string; icon: React.ReactNode }> = [
    {
      href: localePath(lang, "/wardrobe"),
      label: dict.nav.pieces,
      icon: (
        <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      ),
    },
    {
      href: localePath(lang, "/outfits"),
      label: dict.nav?.myOutfits || "Outfits",
      icon: (
        <svg className="h-[22px] w-auto" viewBox="0 0 46.066551 28.888348" fill="currentColor">
          <g transform="translate(-137.06198,-54.789812)">
            <path d="m 139.95038,83.474951 c -0.40984,-0.08058 -1.17663,-0.596876 -1.70398,-1.147317 -0.57842,-0.603734 -1.02964,-1.541288 -1.13729,-2.363083 -0.13749,-1.049458 0.0108,-1.634642 0.64565,-2.548368 0.68843,-0.990819 2.37616,-1.920079 10.25148,-5.644444 6.85253,-3.240675 9.42995,-4.622439 9.4368,-5.059119 0.005,-0.330419 0.1958,-1.009772 0.42357,-1.509674 0.29513,-0.647753 0.85025,-1.018729 1.93195,-1.291106 0.83481,-0.210207 1.91845,-0.782814 2.40809,-1.27246 0.63738,-0.637372 0.89027,-1.26854 0.89027,-2.221911 0,-1.053905 -0.22638,-1.522133 -1.0854,-2.24495 -0.59697,-0.502317 -1.45251,-0.913304 -1.9012,-0.913304 -0.44868,0 -1.16359,0.281633 -1.58868,0.62585 -0.42509,0.344217 -0.88265,1.162504 -1.0168,1.818414 -0.13415,0.655911 -0.51831,1.365654 -0.85369,1.577207 -0.44093,0.278134 -0.78073,0.276987 -1.22714,-0.0041 -0.33955,-0.213832 -0.67202,-0.666863 -0.73882,-1.006735 -0.0668,-0.339873 0.14641,-1.319365 0.47381,-2.17665 0.38647,-1.011941 1.0456,-1.864699 1.87905,-2.431044 0.92649,-0.62957 1.75674,-0.872344 2.98328,-0.872344 0.93473,0 2.14897,0.232423 2.69831,0.516496 0.54934,0.284072 1.40826,1.00312 1.90872,1.597884 0.50046,0.594764 1.01329,1.632341 1.13962,2.305727 0.12632,0.673385 0.11854,1.81965 -0.0173,2.547254 -0.16947,0.90768 -0.72605,1.782658 -1.77324,2.787621 -0.83943,0.805588 -2.01595,1.572264 -3.416917,2.17783 -1.209337,0.35157 -2.47093,0.47793 -3.392253,0.33977 -0.806767,-0.12099 -2.300897,-0.69632 -3.320287,-1.27851 -1.064418,-0.60792 -2.373183,-1.76813 -3.074342,-2.7254 -0.671497,-0.91676 -1.558416,-2.61935 -1.970929,-3.78351 -0.473862,-1.3373 -0.819952,-3.38314 -0.939937,-5.55625 -0.104452,-1.89178 -0.30532,-3.43959 -0.446374,-3.43959 -0.141053,0 -0.735425,0.91281 -1.320826,2.02847 -0.585401,1.11566 -1.327073,2.8391 -1.64816,3.82985 -0.321087,0.99076 -1.119433,4.0963 -1.774101,6.9012 -0.654669,2.80491 -1.527894,5.80429 -1.940499,6.6653 -0.412605,0.861 -1.038078,1.91018 -1.389939,2.33151 -0.351861,0.42133 -1.180021,1.09542 -1.840354,1.49799 -0.761923,0.4645 -1.803672,0.73242 -2.851102,0.73325 -1.001163,8e-4 -1.8595,-0.20768 -2.181751,-0.52993 z m 27.054439,-11.8523 c 0.469702,-0.21401 1.184885,-0.97784 1.589297,-1.69739 0.404412,-0.71955 0.83634,-1.94019 0.95984,-2.71252 0.123501,-0.77233 0.05309,-2.04099 -0.156478,-2.81925 -0.209563,-0.77826 -0.921676,-2.04665 -1.582472,-2.81864 -0.660796,-0.77199 -1.972782,-1.81811 -2.915524,-2.3247 -0.942743,-0.50659 -2.249846,-1.03444 -2.904674,-1.173 -0.842013,-0.17816 -1.279399,-0.11177 -1.493904,0.22676 -0.166819,0.26327 -0.305737,1.75501 -0.308709,3.31498 -0.003,1.55996 0.239431,3.77627 0.53867,4.92513 0.29924,1.14886 0.954738,2.62724 1.456663,3.2853 0.501925,0.65806 1.40803,1.4121 2.013567,1.67565 0.605537,0.26354 1.291944,0.48538 1.525349,0.49298 0.233405,0.008 0.808674,-0.16129 1.278375,-0.3753 z" />
          </g>
        </svg>
      ),
    },
    {
      href: localePath(lang, "/chat"),
      label: dict.nav?.chat || "Tela",
      icon: (
        <div
          className="h-7 w-7 bg-current"
          style={{
            WebkitMaskImage: "url(/tela-logo-icon.svg)",
            WebkitMaskSize: "contain",
            WebkitMaskRepeat: "no-repeat",
            WebkitMaskPosition: "center",
            maskImage: "url(/tela-logo-icon.svg)",
            maskSize: "contain",
            maskRepeat: "no-repeat",
            maskPosition: "center",
          }}
        />
      ),
    },
    {
      href: localePath(lang, "/lookbook"),
      label: dict.nav.lookbook,
      icon: (
        <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z"
          />
        </svg>
      ),
    },
  ];

  const [avatarError, setAvatarError] = useState(false);

  if (!user) return null;

  const showPhoto = user.avatarUrl && !avatarError;
  const isSettingsActive = pathname.startsWith(localePath(lang, "/settings"));

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-700 sm:hidden z-50 pb-safe">
      <div className="flex items-center justify-around h-16">
        {tabs.map((tab) => {
          const isActive =
            pathname === tab.href || pathname.startsWith(tab.href + "/");
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex items-center justify-center min-w-[64px] min-h-[48px] transition-colors ${
                isActive ? "text-stone-700 dark:text-stone-300" : "text-stone-400 dark:text-stone-500"
              }`}
            >
              {tab.icon}
            </Link>
          );
        })}

        {/* Me tab — direct link to settings page */}
        <Link
          href={localePath(lang, "/settings")}
          className={`flex items-center justify-center min-w-[64px] min-h-[48px] transition-colors ${
            isSettingsActive ? "text-stone-700 dark:text-stone-300" : "text-stone-400 dark:text-stone-500"
          }`}
        >
          {showPhoto ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={user.avatarUrl!}
              alt=""
              className="w-7 h-7 rounded-full object-cover"
              onError={() => setAvatarError(true)}
            />
          ) : (
            <svg
              className="w-7 h-7"
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
          )}
        </Link>
      </div>
    </nav>
  );
}
