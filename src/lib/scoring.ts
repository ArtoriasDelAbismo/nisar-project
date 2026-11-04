import type { Weights } from "@/config/hazardModels";
import { DEFAULT_WEIGHTS } from "@/config/hazardModels";
import { generateForecast, lapseAdjust, type Forecast } from "@/data/generators/forecast";
import { clamp, round } from "@/data/generators/prng";
import { REGIONS, type PerilId, type RegionId } from "@/data/generators/regions";
import { generateSectors, type Sector } from "@/data/generators/sectors";

export interface Contribution {
  key: string;
  label: string;
  weight: number; // normalized
  value: number; // 0..1 factor intensity
  points: number; // weight * value * 100
}
export interface SectorScore {
  sector: Sector;
  score: number;
  contributions: Contribution[];
  localMin: number;
}

/** Normalized 0..1 intensities for every factor, per peril. */
export function factorValues(peril: PerilId, s: Sector, f: Forecast, region: RegionId) {
  const localMin = lapseAdjust(f.minNight, s.elevation, REGIONS[region].baseElevation);
  const v: Record<string, number> = {
    precip: clamp(f.rain7d / 90),
    drainage: clamp(1 - s.hand / 6),
    material: s.materialVuln,
    elderly: clamp(s.elderlyShare / 0.25),
    nightTemp: clamp(-localMin / 18),
    elevation: clamp((s.elevation - 150) / 350),
    maxTemp: clamp((f.maxDay - 28) / 16),
    density: clamp(s.density / 120000),
    gust: clamp(f.maxGust / 90),
    exposure: s.coastalExposure,
  };
  return { v, localMin };
}

export function scoreSector(
  peril: PerilId,
  s: Sector,
  f: Forecast,
  region: RegionId,
  weights: Weights,
): SectorScore {
  const { v, localMin } = factorValues(peril, s, f, region);
  const factors = DEFAULT_WEIGHTS[peril];
  const w = weights[peril] ?? {};
  const total = factors.reduce((a, x) => a + (w[x.key] ?? 0), 0) || 1;
  const contributions = factors.map((x) => {
    const weight = (w[x.key] ?? 0) / total;
    return { key: x.key, label: x.label, weight, value: v[x.key] ?? 0, points: round(weight * (v[x.key] ?? 0) * 100, 1) };
  });
  return {
    sector: s,
    score: round(contributions.reduce((a, c) => a + c.points, 0), 0),
    contributions,
    localMin,
  };
}

export function scoreRegion(region: RegionId, peril: PerilId, weights: Weights) {
  const f = generateForecast(region);
  return generateSectors(region)
    .map((s) => scoreSector(peril, s, f, region, weights))
    .sort((a, b) => b.score - a.score);
}

export const RECOMMENDED_ACTIONS: Record<PerilId, string[]> = {
  flood: [
    "Pre-position sandbags and drainage pumps in sectors with HAND < 2 m",
    "Relocate households from lowest tarpaulin clusters to elevated transitional sites",
    "Clear blocked stormwater channels before peak accumulation day",
    "Distribute waterproof sheeting and raised flooring pallets",
  ],
  frost: [
    "Extend warming-hub hours to 24/7 while night minimum < −5 °C",
    "Prioritise fuel and generator backup for modular container towns",
    "Door-to-door checks for residents aged 60+ and people with disabilities",
    "Distribute thermal blankets and winterisation kits",
  ],
  heat: [
    "Open cooling centres and shaded rest points from 11:00–17:00",
    "Increase water trucking to ≥ 15 L/person/day",
    "Deploy oral rehydration salts at medical points",
  ],
  wind: [
    "Secure tent guy-lines and ballast loose sheeting",
    "Pause distribution in open areas during peak gusts",
    "Inspect structural anchoring of container units",
  ],
};
