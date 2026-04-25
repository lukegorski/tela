// ── TYPES ──────────────────────────────────────────────────────────

export interface WeatherContext {
  tempC: number;
  feelsLikeC: number;
  conditionCode: number;
  conditionLabel: string;
  isDay: boolean;
  isRaining: boolean;
  timezone: string;
}

export type TimeOfDay = "morning" | "afternoon" | "evening" | "night";

export interface EnvironmentContext {
  weather: WeatherContext | null;
  timeOfDay: TimeOfDay;
  localHour: number;
  city: string;
  lat: number;
  timezone: string;
  tempUnit: "C" | "F";
}

// ── WMO WEATHER CODES ─────────────────────────────────────────────
// https://open-meteo.com/en/docs — WMO Weather interpretation codes

type WeatherIconKey =
  | "sun"
  | "moon"
  | "cloud-sun"
  | "cloud-moon"
  | "cloud"
  | "fog"
  | "drizzle"
  | "rain"
  | "snow"
  | "thunder";

interface WmoEntry {
  label: string;
  icon: WeatherIconKey;         // daytime icon; night variants derived
  isRain: boolean;
}

const WMO_CODES: Record<number, WmoEntry> = {
  0:  { label: "Clear sky",            icon: "sun",       isRain: false },
  1:  { label: "Mainly clear",         icon: "sun",       isRain: false },
  2:  { label: "Partly cloudy",        icon: "cloud-sun", isRain: false },
  3:  { label: "Overcast",             icon: "cloud",     isRain: false },
  45: { label: "Fog",                  icon: "fog",       isRain: false },
  48: { label: "Depositing rime fog",  icon: "fog",       isRain: false },
  51: { label: "Light drizzle",        icon: "drizzle",   isRain: true },
  53: { label: "Moderate drizzle",     icon: "drizzle",   isRain: true },
  55: { label: "Dense drizzle",        icon: "drizzle",   isRain: true },
  56: { label: "Freezing drizzle",     icon: "drizzle",   isRain: true },
  57: { label: "Dense freezing drizzle", icon: "drizzle", isRain: true },
  61: { label: "Slight rain",          icon: "rain",      isRain: true },
  63: { label: "Moderate rain",        icon: "rain",      isRain: true },
  65: { label: "Heavy rain",           icon: "rain",      isRain: true },
  66: { label: "Freezing rain",        icon: "rain",      isRain: true },
  67: { label: "Heavy freezing rain",  icon: "rain",      isRain: true },
  71: { label: "Slight snow",          icon: "snow",      isRain: false },
  73: { label: "Moderate snow",        icon: "snow",      isRain: false },
  75: { label: "Heavy snow",           icon: "snow",      isRain: false },
  77: { label: "Snow grains",          icon: "snow",      isRain: false },
  80: { label: "Slight rain showers",  icon: "rain",      isRain: true },
  81: { label: "Moderate rain showers", icon: "rain",     isRain: true },
  82: { label: "Violent rain showers", icon: "rain",      isRain: true },
  85: { label: "Slight snow showers",  icon: "snow",      isRain: false },
  86: { label: "Heavy snow showers",   icon: "snow",      isRain: false },
  95: { label: "Thunderstorm",         icon: "thunder",   isRain: true },
  96: { label: "Thunderstorm with slight hail", icon: "thunder", isRain: true },
  99: { label: "Thunderstorm with heavy hail",  icon: "thunder", isRain: true },
};

function getWmoEntry(code: number): WmoEntry {
  return WMO_CODES[code] ?? { label: "Unknown", icon: "cloud", isRain: false };
}

// ── WEATHER ICON KEY ──────────────────────────────────────────────

export function getWeatherIconKey(
  conditionCode: number,
  isDay: boolean
): string {
  const entry = getWmoEntry(conditionCode);
  const base = entry.icon;

  // Night variants for clear/partly cloudy
  if (!isDay) {
    if (base === "sun") return "moon";
    if (base === "cloud-sun") return "cloud-moon";
  }
  return base;
}

// ── FETCH WEATHER ─────────────────────────────────────────────────

export async function fetchWeather(
  lat: number,
  lon: number,
  timezone?: string
): Promise<WeatherContext> {
  const tz = timezone ? encodeURIComponent(timezone) : "auto";
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,weather_code,is_day,precipitation&timezone=${tz}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Open-Meteo API error: ${res.status}`);
  }

  const data = await res.json();
  const current = data.current;
  const entry = getWmoEntry(current.weather_code);

  return {
    tempC: current.temperature_2m,
    feelsLikeC: current.apparent_temperature,
    conditionCode: current.weather_code,
    conditionLabel: entry.label,
    isDay: current.is_day === 1,
    isRaining: entry.isRain,
    timezone: data.timezone,
  };
}

// ── TIME OF DAY ───────────────────────────────────────────────────

export function getTimeOfDay(timezone: string): {
  timeOfDay: TimeOfDay;
  localHour: number;
} {
  const now = new Date();
  const localHour = parseInt(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: timezone,
    }).format(now)
  );

  if (localHour >= 5 && localHour < 12)
    return { timeOfDay: "morning", localHour };
  if (localHour >= 12 && localHour < 17)
    return { timeOfDay: "afternoon", localHour };
  if (localHour >= 17 && localHour < 21)
    return { timeOfDay: "evening", localHour };
  return { timeOfDay: "night", localHour };
}

// ── WEATHER ADVISORY ──────────────────────────────────────────────

export function buildWeatherAdvisory(weather: WeatherContext): string {
  const { tempC, isRaining, conditionCode } = weather;
  const isSnowing = [71, 73, 75, 77, 85, 86].includes(conditionCode);

  const parts: string[] = [];

  if (tempC < 0) {
    parts.push("Freezing temperatures — prioritize heavy insulation, warm layers, and winter boots.");
  } else if (tempC < 10) {
    parts.push("Cold weather — layer up with warm outerwear and closed-toe shoes.");
  } else if (tempC < 18) {
    parts.push("Cool weather — a light jacket or layered look works well.");
  } else if (tempC > 30) {
    parts.push("Very hot — lightweight, breathable fabrics only. Minimal layering.");
  } else if (tempC > 25) {
    parts.push("Warm weather — lighter fabrics and breathable materials work best.");
  }

  if (isRaining) {
    parts.push("Rain expected — consider waterproof outerwear. Avoid suede and fabrics that show water spots.");
  }
  if (isSnowing) {
    parts.push("Snow conditions — waterproof boots and warm outerwear essential.");
  }

  return parts.join(" ");
}

// ── TEMPERATURE CONVERSION ────────────────────────────────────────

export function tempDisplay(tempC: number, unit: "C" | "F"): string {
  if (unit === "F") {
    return `${Math.round(tempC * 9 / 5 + 32)}°F`;
  }
  return `${Math.round(tempC)}°C`;
}

// ── GEOCODING FALLBACK (Open-Meteo) ──────────────────────────────

export interface GeocodingResult {
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
  country: string;
  admin1?: string;
}

export async function geocodeCity(query: string): Promise<GeocodingResult[]> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.results || []).map((r: Record<string, unknown>) => ({
    name: r.name as string,
    latitude: r.latitude as number,
    longitude: r.longitude as number,
    timezone: r.timezone as string,
    country: r.country as string,
    admin1: r.admin1 as string | undefined,
  }));
}
