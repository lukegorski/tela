"use client";

import { useEffect, useRef, useCallback, useState } from "react";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** When true, close button floats over content (for panels with hero images). Default: false (sticky header). */
  overlayClose?: boolean;
  /** When true, hides the built-in desktop close button so content can provide its own. */
  hideDesktopClose?: boolean;
  /** When true, prevents closing via backdrop click, swipe-down, or escape key. */
  preventDismiss?: boolean;
}

export default function BottomSheet({
  isOpen,
  onClose,
  children,
  overlayClose = false,
  hideDesktopClose = false,
  preventDismiss = false,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const dragCurrentY = useRef<number>(0);
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);

  // Handle open/close transitions
  useEffect(() => {
    if (isOpen) {
      setVisible(true);
      setClosing(false);
    } else if (visible && !closing) {
      // isOpen went false while we're visible — trigger animated close
      setClosing(true);
      setTimeout(() => {
        setVisible(false);
        setClosing(false);
      }, 450);
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lock body scroll when visible
  useEffect(() => {
    if (visible) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [visible]);

  // Animated close
  const animateClose = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setVisible(false);
      setClosing(false);
      onClose();
    }, 450);
  }, [onClose]);

  // Close on escape
  useEffect(() => {
    if (!visible) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !preventDismiss) animateClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [visible, animateClose]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (dragStartY.current === null) return;
    const delta = e.touches[0].clientY - dragStartY.current;
    dragCurrentY.current = Math.max(0, delta);
    if (sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${dragCurrentY.current}px)`;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (dragCurrentY.current > 100 && !preventDismiss) {
      animateClose();
    } else if (sheetRef.current) {
      sheetRef.current.style.transform = "";
    }
    dragStartY.current = null;
    dragCurrentY.current = 0;
  }, [animateClose]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[60]">
      {/* Backdrop */}
      <div
        ref={backdropRef}
        className={`absolute inset-0 bg-black/40 transition-opacity duration-[450ms] ${
          closing ? "opacity-0" : "opacity-100 animate-[fadeIn_450ms_ease-out]"
        }`}
        onClick={preventDismiss ? undefined : animateClose}
      />

      {/* Sheet — bottom sheet on mobile, right side panel on desktop */}
      <div
        ref={sheetRef}
        className={`absolute bottom-0 inset-x-0 sm:inset-y-0 sm:left-auto sm:w-[420px] bg-white dark:bg-neutral-900 max-h-[85dvh] sm:max-h-none overflow-y-auto will-change-transform transition-transform duration-[450ms] ease-out ${
          closing
            ? "translate-y-full sm:translate-y-0 sm:translate-x-full"
            : "animate-[slideUp_450ms_ease-out] sm:animate-[slideRight_450ms_ease-out]"
        }`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Mobile: drag handle */}
        <div className="absolute top-0 inset-x-0 z-10 flex justify-center pt-2 pointer-events-none sm:hidden">
          <div className="w-10 h-1 bg-black/20 dark:bg-white/20 rounded-full" />
        </div>

        {/* Desktop: close button */}
        {hideDesktopClose ? null : overlayClose ? (
          <div className="hidden sm:flex absolute top-0 right-0 z-10 p-3">
            <button
              onClick={animateClose}
              className="p-2 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-full hover:bg-white dark:hover:bg-neutral-900 transition-colors"
            >
              <svg className="w-5 h-5 text-neutral-700 dark:text-neutral-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          <div className="hidden sm:flex sticky top-0 z-10 justify-end p-3 bg-white dark:bg-neutral-900">
            <button
              onClick={animateClose}
              className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              <svg className="w-5 h-5 text-neutral-500 dark:text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {children}
      </div>
    </div>
  );
}
