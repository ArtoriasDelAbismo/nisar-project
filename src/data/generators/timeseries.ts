import { addDays, subDays } from "date-fns";
import { rng, round, REF_DATE } from "./prng";
import { REGIONS, type RegionId } from "./regions";
import { generateSectors } from "./sectors";

const SAR_REPEAT_DAYS = 12;

/** 12 SAR acquisition passes on a 12-day repeat cycle ending at the reference date. */
export function sarPasses(): string[] {
  return Array.from({ length: 12 }, (_, i) =>
    subDays(REF_DATE, (11 - i) * SAR_REPEAT_DAYS).toISOString(),
  );
}

export interface DisplacementDay {
  date: string;
  arrivals: number;
  relocations: number;
  total: number;
}

export function displacementSeries(region: RegionId, days = 30): DisplacementDay[] {
  const r = rng(`disp-${region}-${days}`);
  const meta = REGIONS[region];
  const scale = meta.totalDisplaced / (region === "gaza" ? 400 : 600);
  const out: DisplacementDay[] = [];
  let total = meta.totalDisplaced;
  const tmp: Omit<DisplacementDay, "total">[] = [];
  for (let i = 0; i < days; i++) {
    const surge = region === "gaza" && i > days - 12 && i < days - 6 ? 2.4 : 1;
    tmp.push({
      date: subDays(REF_DATE, days - 1 - i).toISOString(),
      arrivals: Math.round(scale * (0.4 + r() * 0.8) * surge),
      relocations: Math.round(scale * (0.3 + r() * 0.7)),
    });
  }
  // back-compute so the last day equals the baseline
  for (let i = tmp.length - 1; i >= 0; i--) {
    const d = tmp[i]!;
    out.unshift({ ...d, total });
    total -= d.arrivals - d.relocations;
  }
  return out;
}

export function monthlyTimeline(region: RegionId) {
  const r = rng(`monthly-${region}`);
  const meta = REGIONS[region];
  return Array.from({ length: 12 }, (_, i) => {
    const d = addDays(subDays(REF_DATE, 365), i * 30);
    return {
      month: d.toISOString(),
      arrivals: Math.round(meta.totalDisplaced * (0.02 + r() * 0.07)),
      relocations: -Math.round(meta.totalDisplaced * (0.015 + r() * 0.05)),
    };
  });
}

export const AGE_BRACKETS = ["0-4", "5-11", "12-17", "18-59", "60+"];

export function demographics(region: RegionId) {
  const r = rng(`demo-${region}`);
  const meta = REGIONS[region];
  const shares =
    region === "gaza" ? [0.15, 0.2, 0.13, 0.45, 0.07] : [0.07, 0.12, 0.1, 0.48, 0.23];
  return AGE_BRACKETS.map((b, i) => {
    const n = meta.totalDisplaced * shares[i]!;
    const f = region === "lviv" && i >= 3 ? 0.58 + r() * 0.06 : 0.49 + r() * 0.03;
    return { bracket: b, female: Math.round(n * f), male: -Math.round(n * (1 - f)) };
  });
}

/** SAR footprint growth (%) vs registered headcount growth (%) per pass. */
export function discrepancySeries(region: RegionId) {
  const sectors = generateSectors(region);
  const passes = sarPasses();
  const r = rng(`disc-${region}`);
  let sar = 0;
  let reg = 0;
  return passes.map((p, i) => {
    const avg = sectors.reduce((a, s) => a + (s.sarTrend[i] ?? 0), 0) / sectors.length;
    sar += avg;
    reg += avg * (0.55 + r() * 0.4);
    return { date: p, sarFootprint: round(sar, 1), registered: round(reg, 1), gap: round(sar - reg, 1) };
  });
}
