import { rng, round } from "./prng";
import type { RegionId } from "./regions";
import { generateSectors } from "./sectors";

export type FacilityType = "medical" | "water" | "heating" | "food" | "cooling";
export interface Facility {
  id: string;
  name: string;
  type: FacilityType;
  sectorId: string;
  coord: [number, number];
  capacity: number;
  utilization: number; // 0..1.3
  status: "Operational" | "Degraded" | "Offline";
}

export const FACILITY_LABEL: Record<FacilityType, string> = {
  medical: "Medical point",
  water: "Water distribution",
  heating: "Warming / heating hub",
  food: "Food distribution",
  cooling: "Cooling centre",
};

const cache = new Map<RegionId, Facility[]>();

export function generateFacilities(region: RegionId): Facility[] {
  const hit = cache.get(region);
  if (hit) return hit;
  const r = rng(`fac-${region}`);
  const types: FacilityType[] =
    region === "gaza" ? ["medical", "water", "food", "cooling"] : ["medical", "heating", "food", "water"];
  const out: Facility[] = [];
  const spread = region === "gaza" ? 0.004 : 0.02;
  generateSectors(region).forEach((s) => {
    types.forEach((t, ti) => {
      if (r() < 0.25 && ti > 1) return;
      const u = 0.5 + r() * 0.75;
      const st = r();
      out.push({
        id: `${s.id}-${t.slice(0, 3).toUpperCase()}`,
        name: `${FACILITY_LABEL[t]} · ${s.name}`,
        type: t,
        sectorId: s.id,
        coord: [round(s.centroid[0] + (r() - 0.5) * spread, 5), round(s.centroid[1] + (r() - 0.5) * spread, 5)],
        capacity: Math.round((t === "medical" ? 120 : t === "heating" ? 400 : 2500) * (0.5 + r())),
        utilization: round(u, 2),
        status: st < 0.08 ? "Offline" : st < 0.25 || u > 1.1 ? "Degraded" : "Operational",
      });
    });
  });
  cache.set(region, out);
  return out;
}
