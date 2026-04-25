import { useEffect, useRef, type RefObject } from "react";

/**
 * Persists scroll position of a container across page navigations via sessionStorage.
 * Saves on every scroll (debounced 200ms) and restores on mount when enabled.
 *
 * @param key     sessionStorage key (e.g. "outfits-scroll")
 * @param scrollRef  ref to the scrollable container element
 * @param enabled    gate restoration until the container is rendered (pass !loading)
 */
export function useScrollPersistence(
  key: string,
  scrollRef: RefObject<HTMLElement | null>,
  enabled: boolean
): void {
  const hasRestoredRef = useRef(false);

  useEffect(() => {
    console.log(`[scroll-persist:${key}] effect run — enabled=${enabled}, ref=${!!scrollRef.current}`);
    if (!enabled || !scrollRef.current) return;

    const el = scrollRef.current;

    // Restore saved position once after content renders
    if (!hasRestoredRef.current) {
      hasRestoredRef.current = true;
      const saved = sessionStorage.getItem(key);
      console.log(`[scroll-persist:${key}] restore — saved=${saved}, scrollHeight=${el.scrollHeight}, clientHeight=${el.clientHeight}`);
      if (saved !== null) {
        const top = parseInt(saved, 10);
        if (!isNaN(top) && top > 0) {
          // Double rAF ensures one paint cycle has completed so the
          // container has its full rendered height before we restore.
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              console.log(`[scroll-persist:${key}] scrollTo(${top}) — scrollHeight=${el.scrollHeight}, clientHeight=${el.clientHeight}`);
              el.scrollTo({ top });
              requestAnimationFrame(() => {
                console.log(`[scroll-persist:${key}] after scrollTo — scrollTop=${el.scrollTop}`);
              });
            });
          });
        }
      }
    }

    // Save scroll position on every scroll (debounced)
    let timer: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        sessionStorage.setItem(key, String(el.scrollTop));
      }, 200);
    };
    el.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      clearTimeout(timer);
      el.removeEventListener("scroll", onScroll);
      // Final save on cleanup
      console.log(`[scroll-persist:${key}] cleanup save — scrollTop=${el.scrollTop}`);
      sessionStorage.setItem(key, String(el.scrollTop));
    };
  }, [key, enabled, scrollRef]);
}
