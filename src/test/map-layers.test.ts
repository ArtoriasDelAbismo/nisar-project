import { describe, expect, it } from "vitest";
import { facilitiesGeo, facilitySummaryGeo, sectorsGeo } from "@/data/generators/layers";
import { generateFacilities } from "@/data/generators/facilities";
import { generateSectors } from "@/data/generators/sectors";
import type { RegionId } from "@/data/generators/regions";

const REGIONS: RegionId[] = ["gaza", "lviv"];

describe.each(REGIONS)("map layers for %s", (region) => {
  const hexes = sectorsGeo(region, []).features;

  it("gives every sector hexagons that carry only that sector's values", () => {
    const sectors = generateSectors(region);
    sectors.forEach((s) => {
      const own = hexes.filter((h) => h.properties?.["id"] === s.id);
      expect(own.length).toBeGreaterThan(3);
      expect(new Set(own.map((h) => h.properties?.["density"]))).toEqual(new Set([s.density]));
      own.forEach((h) => expect(h.id).toBe(Number(s.id.slice(3))));
    });
  });

  it("scales density to the region, with the densest sector at 1", () => {
    expect(Math.max(...hexes.map((h) => h.properties?.["densityLevel"] as number))).toBe(1);
  });

  it("never reuses a grid cell, so sectors can't stack on each other", () => {
    const rings = hexes.map((h) => JSON.stringify((h.geometry as GeoJSON.Polygon).coordinates));
    expect(new Set(rings).size).toBe(rings.length);
  });

  it("counts facilities per sector without losing any", () => {
    const summary = facilitySummaryGeo(region).features;
    const total = summary.reduce(
      (sum, f) => sum + Number(String(f.properties?.["label"]).split("/")[1]),
      0,
    );
    expect(total).toBe(generateFacilities(region).length);
    expect(facilitiesGeo(region).features).toHaveLength(total);
    summary.forEach((f) => {
      const [up, all] = String(f.properties?.["label"]).split("/").map(Number);
      if (f.properties?.["status"] === "Operational") expect(up).toBe(all);
      else expect(up).toBeLessThan(all!);
    });
  });
});
