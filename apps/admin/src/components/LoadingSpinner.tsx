"use client";

import { useState, useEffect } from "react";

const SPINNERS = [
  "/spinners/spinner-1.svg",
  "/spinners/spinner-2.svg",
  "/spinners/spinner-3.svg",
  "/spinners/spinner-4.svg",
  "/spinners/spinner-5.svg",
  "/spinners/spinner-6.svg",
];

// Module-level shuffle queue: cycles through all spinners before repeating
let queue: string[] = [];

function nextSpinner(): string {
  if (queue.length === 0) {
    queue = [...SPINNERS];
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
  }
  return queue.pop()!;
}

export default function LoadingSpinner({ variant = "dark" }: { variant?: "dark" | "auto" } = {}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    setSrc(nextSpinner());
  }, []);

  if (!src) return null;

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src}
      alt=""
      className={`animate-logo-pulse brightness-0 opacity-20${variant === "auto" ? " dark:invert" : ""}`}
    />
  );
}
