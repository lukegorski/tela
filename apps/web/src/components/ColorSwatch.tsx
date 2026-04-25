"use client";

import { colorNameToHex } from "@/lib/colors";

interface ColorSwatchProps {
  colorName: string;
  displayName?: string;
  size?: "sm" | "md";
  showLabel?: boolean;
}

const SIZE_CLASSES = {
  sm: "w-3 h-3",
  md: "w-4 h-4",
} as const;

function toTitleCase(s: string) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ColorSwatch({
  colorName,
  displayName,
  size = "sm",
  showLabel = true,
}: ColorSwatchProps) {
  const hex = colorNameToHex(colorName);

  if (!hex && !showLabel) return null;

  return (
    <span className="inline-flex items-center gap-1.5">
      {hex && (
        <span
          aria-hidden="true"
          className={`${SIZE_CLASSES[size]} rounded-sm shrink-0`}
          style={{
            backgroundColor: hex,
            boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.12)",
          }}
        />
      )}
      {showLabel && toTitleCase(displayName || colorName)}
    </span>
  );
}
