import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHTS, defaultWeightMap } from "@/config/hazardModels";
import { scoreRegion } from "@/lib/scoring";
import { evaluateAlerts, DEFAULT_RULES } from "@/data/generators/alerts";
import { generateSectors } from "@/data/generators/sectors";

describe("hazard model", () => {
  it("uses the specified default flood weights (40/25/25/10)", () => {
    expect(DEFAULT_WEIGHTS.flood.map((f) => f.weight)).toEqual([0.4, 0.25, 0.25, 0.1]);
  });
  it("generates 16 Gaza sectors and 10 Lviv clusters", () => {
    expect(generateSectors("gaza")).toHaveLength(16);
    expect(generateSectors("lviv")).toHaveLength(10);
  });
  it("recalculates scores when a weight changes", () => {
    const w = defaultWeightMap();
    const top = scoreRegion("gaza", "flood", w)[0]!;
    w.flood["precip"] = 0;
    const b = scoreRegion("gaza", "flood", w).find((s) => s.sector.id === top.sector.id)!.score;
    const a = top.score;
    expect(b).not.toBe(a);
  });
  it("Gaza flood alerts only fire above index 70", () => {
    const alerts = evaluateAlerts("gaza", DEFAULT_RULES.filter((r) => r.id === "r1"), defaultWeightMap());
    alerts.forEach((a) => expect(a.value).toBeGreaterThan(70));
  });
  it("Lviv night-temp alerts only fire below -5°C", () => {
    const alerts = evaluateAlerts("lviv", DEFAULT_RULES.filter((r) => r.id === "r4"), defaultWeightMap());
    expect(alerts.length).toBeGreaterThan(0);
    alerts.forEach((a) => expect(a.value).toBeLessThan(-5));
  });
});
