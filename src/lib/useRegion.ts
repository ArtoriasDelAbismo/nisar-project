import { useMemo } from "react";
import { useStore } from "./store";
import { REGIONS, type PerilId } from "@/data/generators/regions";
import { generateSectors } from "@/data/generators/sectors";
import { generateForecast } from "@/data/generators/forecast";
import { generateFacilities } from "@/data/generators/facilities";
import { scoreRegion } from "./scoring";

export function useRegion(peril?: PerilId) {
  const { region, weights } = useStore();
  const meta = REGIONS[region];
  const p = peril ?? meta.primaryPeril;
  return useMemo(
    () => ({
      region,
      meta,
      peril: p,
      sectors: generateSectors(region),
      forecast: generateForecast(region),
      facilities: generateFacilities(region),
      scores: scoreRegion(region, p, weights),
    }),
    [region, meta, p, weights],
  );
}
