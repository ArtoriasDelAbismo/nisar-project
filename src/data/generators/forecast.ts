import { addDays, addHours } from "date-fns";
import { rng, round, REF_DATE } from "./prng";
import type { RegionId } from "./regions";

export interface DailyForecast {
  date: string;
  rainMm: number;
  maxTemp: number;
  minTemp: number;
  gustKmh: number;
}
export interface HourlyPoint {
  time: string;
  temp: number;
}

export interface Forecast {
  daily: DailyForecast[];
  hourly: HourlyPoint[]; // 7 days x 24h
  rain7d: number;
  minNight: number;
  maxDay: number;
  maxGust: number;
}

const cache = new Map<RegionId, Forecast>();

export function generateForecast(region: RegionId): Forecast {
  const hit = cache.get(region);
  if (hit) return hit;
  const r = rng(`forecast-${region}`);
  const isGaza = region === "gaza";
  const daily: DailyForecast[] = Array.from({ length: 7 }, (_, i) => {
    const storm = isGaza ? (i === 2 || i === 3 ? 1 : 0) : i === 4 ? 1 : 0;
    return {
      date: addDays(REF_DATE, i).toISOString(),
      rainMm: round(isGaza ? r() * 8 + storm * (28 + r() * 22) : r() * 4 + storm * 8, 1),
      maxTemp: round(isGaza ? 22 + r() * 5 - storm * 4 : -1 + r() * 4 - storm * 3, 1),
      minTemp: round(isGaza ? 13 + r() * 3 : -7 - r() * 5 - storm * 4, 1),
      gustKmh: round(isGaza ? 25 + r() * 15 + storm * 35 : 20 + r() * 15 + storm * 20, 0),
    };
  });
  const hourly: HourlyPoint[] = [];
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const { maxTemp, minTemp } = daily[d]!;
      const phase = Math.cos(((h - 15) / 24) * Math.PI * 2); // peak 15:00, min 03:00
      const t = minTemp + ((maxTemp - minTemp) * (phase + 1)) / 2 + (r() - 0.5) * 0.6;
      hourly.push({ time: addHours(addDays(REF_DATE, d), h - 6).toISOString(), temp: round(t, 1) });
    }
  }
  const f: Forecast = {
    daily,
    hourly,
    rain7d: round(daily.reduce((a, b) => a + b.rainMm, 0), 1),
    minNight: Math.min(...daily.map((d) => d.minTemp)),
    maxDay: Math.max(...daily.map((d) => d.maxTemp)),
    maxGust: Math.max(...daily.map((d) => d.gustKmh)),
  };
  cache.set(region, f);
  return f;
}

/** Environmental lapse rate: −6.5 °C per 1000 m above the reference station. */
export const LAPSE_RATE = -6.5 / 1000;
export function lapseAdjust(temp: number, elevation: number, baseElevation: number) {
  return round(temp + (elevation - baseElevation) * LAPSE_RATE, 1);
}
