/**
 * Fashion color name → hex mapping and resolver.
 * Used by ColorSwatch to render actual color squares from AI-generated or predefined color names.
 */

const FASHION_COLOR_MAP: Record<string, string> = {
  // --- COLOR_OPTIONS (predefined) ---
  black: "#1a1a1a",
  white: "#ffffff",
  navy: "#1b2a4a",
  gray: "#8c8c8c",
  beige: "#c8b89a",
  brown: "#6b4226",
  olive: "#6b7c4e",
  burgundy: "#6b1c2a",
  cream: "#f5f0e1",
  camel: "#c19a6b",
  rust: "#a0522d",
  sage: "#9caf88",
  terracotta: "#c16a4f",
  blush: "#e8b4b8",
  cobalt: "#1a3f8f",
  mustard: "#c5a032",

  // --- Blues ---
  "navy blue": "#1b2a4a",
  "dark blue": "#1a2744",
  "light blue": "#a4c8e1",
  "sky blue": "#87ceeb",
  "royal blue": "#2d5da1",
  "baby blue": "#b5d4e8",
  "powder blue": "#b0d4e8",
  "cobalt blue": "#1a3f8f",
  "steel blue": "#4682b4",
  blue: "#3b6ba5",
  denim: "#5b7fa5",
  indigo: "#3f4f7f",
  periwinkle: "#8e8ec8",

  // --- Grays ---
  charcoal: "#36454f",
  "charcoal gray": "#36454f",
  "charcoal grey": "#36454f",
  "light gray": "#c0c0c0",
  "light grey": "#c0c0c0",
  "dark gray": "#505050",
  "dark grey": "#505050",
  "heather gray": "#9b9ea3",
  "heather grey": "#9b9ea3",
  grey: "#8c8c8c",
  slate: "#6a7b8b",
  silver: "#b8b8b8",
  pewter: "#8e9196",
  gunmetal: "#536267",

  // --- Whites / Neutrals ---
  "off-white": "#f0ebe0",
  "off white": "#f0ebe0",
  ivory: "#f5f0e1",
  ecru: "#cec5a7",
  oatmeal: "#d8cdb8",

  // --- Browns / Tans ---
  tan: "#c2a882",
  khaki: "#b8a97e",
  sand: "#cebf9e",
  taupe: "#9e8e7e",
  mocha: "#6e4b3a",
  chocolate: "#4b2a14",
  espresso: "#3c1e0f",
  cognac: "#8b4e2a",
  chestnut: "#7b3f24",
  "burnt sienna": "#a0522d",
  "dark brown": "#3e2318",
  "light brown": "#a0845c",

  // --- Reds ---
  red: "#b5312c",
  crimson: "#8b1a2b",
  maroon: "#5a1a1a",
  oxblood: "#4a0e0e",
  wine: "#5e1a2a",
  "dark red": "#6e1a1a",
  scarlet: "#c12828",
  tomato: "#c34030",

  // --- Pinks ---
  pink: "#e89aab",
  "hot pink": "#e2508c",
  fuchsia: "#c44a8a",
  rose: "#c97e8e",
  "dusty rose": "#c4929a",
  "dusty pink": "#c4929a",
  mauve: "#a87e8e",
  salmon: "#e89080",
  coral: "#e07060",

  // --- Oranges ---
  orange: "#d47a2e",
  "burnt orange": "#b35c1e",
  peach: "#e8b89a",
  apricot: "#e0a070",

  // --- Yellows ---
  yellow: "#d4b830",
  gold: "#c5a032",
  lemon: "#dcc830",

  // --- Greens ---
  green: "#4a7a4a",
  "olive green": "#6b7c4e",
  "dark olive green": "#4a5a32",
  "forest green": "#2e5a3a",
  "hunter green": "#2a4a2e",
  emerald: "#2e8060",
  mint: "#a0d8b4",
  seafoam: "#8ec8b0",
  "dark green": "#2a4a2e",
  "light green": "#8ebf8e",
  "army green": "#525e3a",
  "military green": "#525e3a",
  kelly: "#3a8a4e",

  // --- Teals / Aquas ---
  teal: "#2e7a7a",
  turquoise: "#48b0a0",
  aqua: "#5ab8b8",
  cyan: "#4aa8b8",

  // --- Purples ---
  purple: "#6b3a7a",
  violet: "#7a4a8a",
  plum: "#5e2a4a",
  eggplant: "#3e1a3e",
  lavender: "#b0a0c8",
  lilac: "#c0a8d8",
  magenta: "#a03070",

  // --- Multi-tone modifiers ---
  "light pink": "#f0c0c8",
  "dark navy": "#101e30",
  "bright red": "#d42020",
  "bright blue": "#2060c0",
  "pale blue": "#c0d8e8",
  "pale pink": "#f0d0d8",
  "pale yellow": "#f0e8b0",
  "deep red": "#6e1a1a",
  "deep blue": "#1a2a50",
  "deep green": "#1e3e20",
  "deep purple": "#3e1a5e",
};

/**
 * Resolve a free-form color name string to a hex value.
 * Tries exact match first, then progressively shorter suffixes.
 * Returns null if no match found.
 */
export function colorNameToHex(name: string): string | null {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return null;

  // Exact match
  if (FASHION_COLOR_MAP[normalized]) return FASHION_COLOR_MAP[normalized];

  // Compound decomposition: "dark olive green" → try "olive green" → "green"
  const words = normalized.split(/\s+/);
  for (let i = 1; i < words.length; i++) {
    const suffix = words.slice(i).join(" ");
    if (FASHION_COLOR_MAP[suffix]) return FASHION_COLOR_MAP[suffix];
  }

  return null;
}

/**
 * Check whether a free-form color name matches a COLOR_OPTION filter.
 * Uses case-insensitive substring matching so "Navy Blue" matches "Navy", etc.
 */
export function colorMatchesFilter(
  colorName: string,
  filterColor: string
): boolean {
  const cn = colorName.toLowerCase();
  const fc = filterColor.toLowerCase();
  return cn === fc || cn.includes(fc);
}
