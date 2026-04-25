"use client";

/**
 * Pixel-perfect port of legacy src/components/LocationSettingsContent.tsx.
 *
 * Visual + behavior parity:
 *   - City search input with Google Places autocomplete (when API key is
 *     configured) or Open-Meteo geocoding fallback (always available)
 *   - Selecting a city saves it + fetches current weather
 *   - Below: current location display with weather icon + temp + condition
 *   - Below: temperature unit toggle (°C / °F)
 *
 * Data-layer changes vs legacy (no firebase imports):
 *   - Firestore updateDoc → trpc.capability.execute({name:
 *     'user.updateLocation', input: ...}). Same payload shape.
 *   - Storage / cookies untouched. WeatherIcon extracted to its own file
 *     (legacy co-located it here; we share it with Navbar + SettingsMenu).
 */
import { useState, useEffect, useCallback } from "react";
import { useAuthContext } from "@/components/AuthProvider";
import { useDictionary } from "@/components/DictionaryProvider";
import { fetchWeather, getWeatherIconKey, tempDisplay, geocodeCity } from "@/lib/weather";
import type { WeatherContext, GeocodingResult } from "@/lib/weather";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { trpc } from "@/trpc/client";
import { WeatherIcon } from "@/components/WeatherIcon";

// Re-export WeatherIcon at the legacy path so any code that historically
// imported `WeatherIcon` from `LocationSettingsContent` continues to
// resolve. New code should import from "@/components/WeatherIcon".
export { WeatherIcon };

export default function LocationSettingsContent() {
  const { dict, lang } = useDictionary();
  const { user, profile, refreshProfile } = useAuthContext();

  const location = profile?.location;
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [weather, setWeather] = useState<WeatherContext | null>(null);
  const [loadingWeather, setLoadingWeather] = useState(false);

  // Google Places state
  const [placesLoaded, setPlacesLoaded] = useState(false);
  const [placesError, setPlacesError] = useState(false);
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);

  // Fallback geocoding state
  const [fallbackResults, setFallbackResults] = useState<GeocodingResult[]>([]);
  const [searchingFallback, setSearchingFallback] = useState(false);

  const execute = trpc.capability.execute.useMutation();

  // Load Google Places (New API)
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      setPlacesError(true);
      return;
    }

    try {
      setOptions({ key: apiKey, v: "weekly" });
    } catch {
      // setOptions can only be called once; ignore if already set
    }

    importLibrary("places")
      .then(() => {
        setPlacesLoaded(true);
      })
      .catch(() => {
        setPlacesError(true);
      });
  }, []);

  // Fetch current weather when location exists
  useEffect(() => {
    if (!location) return;
    setLoadingWeather(true);
    fetchWeather(location.lat, location.lon, location.timezone)
      .then(setWeather)
      .catch(() => setWeather(null))
      .finally(() => setLoadingWeather(false));
  }, [location]);

  // Google Places autocomplete (New API)
  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value);
      setFallbackResults([]);

      if (!value.trim()) {
        setSuggestions([]);
        return;
      }

      if (placesLoaded) {
        google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: value,
          includedPrimaryTypes: ["locality", "administrative_area_level_3", "postal_town"],
          language: lang,
        })
          .then(({ suggestions: results }) => {
            setSuggestions(results || []);
          })
          .catch(() => {
            setSuggestions([]);
          });
      }
    },
    [placesLoaded, lang]
  );

  // Save location through our user.updateLocation capability
  async function saveLocation(city: string, lat: number, lon: number, country?: string) {
    if (!user) return;
    setSaving(true);
    try {
      // Fetch weather with timezone=auto to derive IANA timezone
      const weatherData = await fetchWeather(lat, lon);
      const timezone = weatherData.timezone;

      await execute.mutateAsync({
        name: "user.updateLocation",
        input: {
          city,
          ...(country ? { country } : {}),
          lat,
          lon,
          timezone,
          tempUnit: location?.tempUnit ?? "C",
        },
      });
      await refreshProfile();
      setQuery("");
      setSuggestions([]);
      setFallbackResults([]);
      setWeather(weatherData);
    } finally {
      setSaving(false);
    }
  }

  // Handle Google Places selection (New API)
  async function handlePlaceSelect(placeId: string) {
    const place = new google.maps.places.Place({ id: placeId });
    const { place: details } = await place.fetchFields({
      fields: ["location", "displayName", "addressComponents"],
    });
    if (!details.location) return;
    const lat = details.location.lat();
    const lon = details.location.lng();
    const city = details.displayName || "";
    // Extract country from address components
    const countryComponent = details.addressComponents?.find(
      (c: google.maps.places.AddressComponent) => c.types.includes("country")
    );
    const country = countryComponent?.longText || undefined;
    saveLocation(city, lat, lon, country);
  }

  // Handle fallback search (Open-Meteo geocoding)
  async function handleFallbackSearch() {
    if (!query.trim()) return;
    setSearchingFallback(true);
    try {
      const results = await geocodeCity(query);
      setFallbackResults(results);
    } finally {
      setSearchingFallback(false);
    }
  }

  // Handle temp unit toggle — replace the saved location with new tempUnit
  async function setTempUnit(unit: "C" | "F") {
    if (!user || !location) return;
    await execute.mutateAsync({
      name: "user.updateLocation",
      input: {
        city: location.city,
        ...(location.country ? { country: location.country } : {}),
        lat: location.lat,
        lon: location.lon,
        timezone: location.timezone,
        tempUnit: unit,
      },
    });
    await refreshProfile();
  }

  return (
    <div className="space-y-8">

      {/* City Search */}
      <section>
        <h2 className="text-sm font-semibold tracking-widest uppercase text-neutral-400 dark:text-neutral-500 mb-3">
          {dict.settings.location}
        </h2>

        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && placesError) {
                handleFallbackSearch();
              }
            }}
            placeholder={dict.settings.cityPlaceholder}
            className="w-full px-4 py-3 border border-stone-300 dark:border-neutral-600 dark:bg-neutral-800 rounded-none text-sm focus:outline-none focus:ring-1 focus:ring-stone-400 dark:focus:ring-stone-500 focus:border-stone-400 dark:focus:border-stone-500"
          />

          {/* Google Places suggestions (New API) */}
          {suggestions.length > 0 && (
            <ul className="absolute z-20 w-full bg-white dark:bg-neutral-800 border border-stone-300 dark:border-neutral-600 mt-[-1px]">
              {suggestions.map((s) => {
                const pred = s.placePrediction;
                if (!pred) return null;
                return (
                  <li key={pred.placeId}>
                    <button
                      onClick={() => handlePlaceSelect(pred.placeId)}
                      className="w-full px-4 py-3 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors"
                    >
                      {pred.text.text}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Fallback search button (when Google Places unavailable) */}
          {placesError && query.trim() && (
            <button
              onClick={handleFallbackSearch}
              disabled={searchingFallback}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 text-xs font-medium text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
            >
              {searchingFallback ? "..." : "Search"}
            </button>
          )}
        </div>

        {/* Fallback results */}
        {fallbackResults.length > 0 && (
          <ul className="border border-stone-300 dark:border-neutral-600 mt-[-1px]">
            {fallbackResults.map((r, i) => (
              <li key={i}>
                <button
                  onClick={() =>
                    saveLocation(r.name, r.latitude, r.longitude, r.country)
                  }
                  className="w-full px-4 py-3 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors"
                >
                  {r.name}
                  {r.admin1 ? `, ${r.admin1}` : ""}
                  {r.country ? ` — ${r.country}` : ""}
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Current location display */}
        {location && !saving && (
          <div className="mt-4 flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
            {weather && (
              <WeatherIcon
                iconKey={getWeatherIconKey(
                  weather.conditionCode,
                  weather.isDay
                )}
                className="w-5 h-5"
              />
            )}
            <span className="font-medium">{location.city}</span>
            {loadingWeather ? (
              <span className="text-neutral-400 dark:text-neutral-500">...</span>
            ) : weather ? (
              <span className="text-neutral-400 dark:text-neutral-500">
                {tempDisplay(weather.tempC, location.tempUnit)} ·{" "}
                {weather.conditionLabel}
              </span>
            ) : null}
          </div>
        )}

        {saving && (
          <div className="mt-4 text-xs text-neutral-400 dark:text-neutral-500">
            Saving...
          </div>
        )}

        {!location && !saving && (
          <p className="mt-3 text-xs text-neutral-400 dark:text-neutral-500">
            {dict.settings.noLocationSet}
          </p>
        )}
      </section>

      {/* Temperature Unit */}
      {location && (
        <section>
          <h2 className="text-sm font-semibold tracking-widest uppercase text-neutral-400 dark:text-neutral-500 mb-3">
            {dict.settings.temperatureUnit}
          </h2>
          <div className="flex gap-2">
            {(["C", "F"] as const).map((unit) => (
              <button
                key={unit}
                onClick={() => setTempUnit(unit)}
                className={`px-5 py-2.5 text-sm font-medium transition-colors ${
                  location.tempUnit === unit
                    ? "bg-stone-700 text-stone-50 dark:bg-stone-300 dark:text-stone-900"
                    : "bg-stone-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 hover:bg-stone-200 dark:hover:bg-neutral-700"
                }`}
              >
                °{unit}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
