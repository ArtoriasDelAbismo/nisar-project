import type { PerilId } from "@/data/generators/regions";

export interface Factor {
  key: string;
  label: string;
  weight: number; // 0..1, normalized at scoring time
}

/** Default transparent weights per peril. Adjustable live in Settings. */
export const DEFAULT_WEIGHTS: Record<PerilId, Factor[]> = {
  flood: [
    { key: "precip", label: "7-day precipitation", weight: 0.4 },
    { key: "drainage", label: "Drainage proximity (HAND)", weight: 0.25 },
    { key: "material", label: "Shelter material vulnerability", weight: 0.25 },
    { key: "elderly", label: "Elderly population share", weight: 0.1 },
  ],
  frost: [
    { key: "nightTemp", label: "Night minimum temperature", weight: 0.45 },
    { key: "elevation", label: "Elevation lapse adjustment", weight: 0.1 },
    { key: "material", label: "Heating / insulation vulnerability", weight: 0.3 },
    { key: "elderly", label: "Elderly population share", weight: 0.15 },
  ],
  heat: [
    { key: "maxTemp", label: "Daytime maximum temperature", weight: 0.45 },
    { key: "density", label: "Population density", weight: 0.2 },
    { key: "material", label: "Shelter material vulnerability", weight: 0.25 },
    { key: "elderly", label: "Elderly population share", weight: 0.1 },
  ],
  wind: [
    { key: "gust", label: "Peak wind gust", weight: 0.45 },
    { key: "exposure", label: "Coastal / open exposure", weight: 0.25 },
    { key: "material", label: "Shelter material vulnerability", weight: 0.2 },
    { key: "elderly", label: "Elderly population share", weight: 0.1 },
  ],
};

export type Weights = Record<PerilId, Record<string, number>>;

export function defaultWeightMap(): Weights {
  const out = {} as Weights;
  (Object.keys(DEFAULT_WEIGHTS) as PerilId[]).forEach((p) => {
    out[p] = Object.fromEntries(DEFAULT_WEIGHTS[p].map((f) => [f.key, f.weight]));
  });
  return out;
}

export const RISK_BANDS = [
  { max: 40, label: "Low", token: "risk-low" },
  { max: 70, label: "Warning", token: "risk-warn" },
  { max: 85, label: "Critical", token: "risk-crit" },
  { max: 101, label: "Extreme", token: "risk-extreme" },
] as const;

export function riskBand(score: number) {
  return RISK_BANDS.find((b) => score < b.max) ?? RISK_BANDS[3];
}
