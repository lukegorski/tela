/**
 * OpenWeatherMap client. Fetches current conditions by lat/lon.
 * Returns null if no API key is configured (capability handles gracefully).
 */
export interface WeatherSnapshot {
  temperatureCelsius: number;
  condition: string;
  humidity: number;
  windSpeedKph: number;
  location: string;
}

export async function fetchWeather(
  lat: number,
  lon: number,
): Promise<WeatherSnapshot | null> {
  const apiKey = process.env.OPENWEATHERMAP_API_KEY;
  if (!apiKey) return null;

  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}`;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    throw new Error(`OpenWeatherMap returned ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    main: { temp: number; humidity: number };
    weather: Array<{ main: string; description: string }>;
    wind: { speed: number };
    name: string;
  };

  return {
    temperatureCelsius: data.main.temp,
    condition: data.weather[0]?.description ?? 'unknown',
    humidity: data.main.humidity,
    // OWM returns wind speed in m/s when units=metric — convert to km/h
    windSpeedKph: Math.round(data.wind.speed * 3.6),
    location: data.name,
  };
}
