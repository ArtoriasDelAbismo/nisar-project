import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  changedShare,
  changeEvents,
  parseAnalysis,
  previousPassIndex,
  regionChangeSeries,
  type NisarPass,
} from "@/lib/nisarAnalysis";

const measure = (brighterPct: number | null, darkerPct: number | null) => ({
  validPct: 100,
  hhDb: -7,
  hvDb: -14,
  deltaHhDb: 0.1,
  deltaHvDb: 0.1,
  brighterPct,
  darkerPct,
});
const pass = (
  acquired: string,
  sectors: NisarPass["sectors"],
  previousAcquired: string | null = null,
) => ({ acquired, sectors, previousAcquired }) as NisarPass;

describe("NISAR analysis", () => {
  it("parses the committed Gaza results, oldest pass first", () => {
    const analysis = parseAnalysis(
      JSON.parse(readFileSync("public/data/nisar/gaza/index.json", "utf8")),
    );
    const dates = analysis.passes.map((p) => p.acquired);
    expect(dates.length).toBeGreaterThan(0);
    expect(dates).toEqual([...dates].sort());
  });

  it("parses the committed Lviv results and keeps the faulty comparison out", () => {
    const analysis = parseAnalysis(
      JSON.parse(readFileSync("public/data/nisar/lviv/index.json", "utf8")),
    );
    const faulty = analysis.passes.find((p) => p.acquired.startsWith("2026-10-07"));
    expect(faulty?.baselineDays).toBeNull();
    expect(faulty?.images.change).toBeNull();
  });

  it("treats a sector with no comparison as unknown, not as zero change", () => {
    expect(changedShare(measure(null, null))).toBeNull();
    expect(changedShare(undefined)).toBeNull();
    expect(changedShare(measure(0.4, 0.3))).toBe(0.7);
  });

  it("lists only sectors above the change threshold, newest first", () => {
    const events = changeEvents(
      [
        pass("2026-10-01", { a: measure(0.8, 0.3), b: measure(0.2, 0.1) }),
        pass("2026-10-13", { a: measure(2, 0), b: measure(null, null) }),
      ],
      [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
    );
    expect(events.map((e) => [e.date, e.sectorId])).toEqual([
      ["2026-10-13", "a"],
      ["2026-10-01", "a"],
    ]);
  });

  it("averages region change over measured sectors only", () => {
    const series = regionChangeSeries([
      pass("2026-10-01", { a: measure(null, null) }),
      pass("2026-10-13", { a: measure(1, 0.5), b: measure(0, 0.5), c: measure(null, null) }),
    ]);
    expect(series).toEqual([{ date: "2026-10-13", brighter: 0.5, darker: 0.5 }]);
  });

  it("finds the pass a comparison actually used, across other tracks", () => {
    const passes = [pass("d1", {}), pass("d2", {}), pass("d3", {}, "d1")];
    expect(previousPassIndex(passes, 2)).toBe(0);
    expect(previousPassIndex(passes, 1)).toBe(0);
  });
});
