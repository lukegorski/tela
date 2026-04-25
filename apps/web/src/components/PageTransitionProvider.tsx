"use client";

import { createContext, useContext, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";

type Direction = "left" | "right";

interface PageTransitionContextValue {
  navigateWithTransition: (href: string, direction: Direction) => void;
  directionRef: React.RefObject<Direction | null>;
}

const PageTransitionContext = createContext<PageTransitionContextValue>({
  navigateWithTransition: () => {},
  directionRef: { current: null },
});

export function usePageTransition() {
  return useContext(PageTransitionContext);
}

export default function PageTransitionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const directionRef = useRef<Direction | null>(null);

  const navigateWithTransition = useCallback(
    (href: string, direction: Direction) => {
      directionRef.current = direction;
      router.push(href);
    },
    [router]
  );

  return (
    <PageTransitionContext.Provider value={{ navigateWithTransition, directionRef }}>
      {children}
    </PageTransitionContext.Provider>
  );
}

/**
 * Wrapper that triggers a CSS slide animation when the route changes.
 * Uses key={pathname} to force React to remount the div, which re-triggers
 * the CSS animation. Place inside <main> around {children}.
 */
export function PageTransitionWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { directionRef } = usePageTransition();
  const direction = directionRef.current;

  return (
    <div
      key={pathname}
      className={direction ? `page-slide-${direction}` : undefined}
      onAnimationEnd={() => {
        directionRef.current = null;
      }}
    >
      {children}
    </div>
  );
}
