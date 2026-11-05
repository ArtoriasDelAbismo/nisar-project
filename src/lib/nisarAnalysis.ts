import { z } from "zod";
import type { RegionId } from "@/data/generators/regions";

/**
 * Real per-sector NISAR measurements produced by `pipeline/`. Backscatter change shows that a
 * surface changed, not what changed, so these values never feed hazard scoring.
 */

/**
 * Sectors at or above this changed-area share become change log entries. Stable Gaza pass pairs
 * flag about 0.1-0.5% of pixels from noise alone, so 1% sits clearly above that background.
 */
export const EVENT_SHARE_PCT = 1;

const pct = z.number().nullable();
const sectorSchema = z.object({
  validPct: z.number(),
  hhDb: z.number().nullable(),
  hvDb: pct,
  deltaHhDb: pct,
  deltaHvDb: pct,
  brighterPct: pct,
  darkerPct: pct,
});
const imageSchema = z.object({
  url: z.string(),
  corners: z.tuple([
    z.tuple([z.number(), z.number()]),
    z.tuple([z.number(), z.number()]),
    z.tuple([z.number(), z.number()]),
    z.tuple([z.number(), z.number()]),
  ]),
});
const passSchema = z.object({
  id: z.string(),
  acquired: z.string(),
  track: z.number(),
  frame: z.number(),
  direction: z.enum(["Ascending", "Descending"]),
  polarization: z.string(),
  previousAcquired: z.string().nullable(),
  baselineDays: z.number().nullable(),
  images: z.object({ backscatter: imageSchema, change: imageSchema.nullable() }),
  sectors: z.record(z.string(), sectorSchema),
});
const analysisSchema = z.object({
  region: z.string(),
  generatedAt: z.string(),
  passes: z.array(passSchema),
});

export type NisarAnalysis = z.infer<typeof analysisSchema>;
export type NisarPass = z.infer<typeof passSchema>;
export type NisarSectorMeasure = z.infer<typeof sectorSchema>;
export type MapImage = z.infer<typeof imageSchema>;

/** Passes come back oldest first, the order timelines read in. */
export function parseAnalysis(json: unknown): NisarAnalysis {
  const analysis = analysisSchema.parse(json);
  return {
    ...analysis,
    passes: [...analysis.passes].sort((a, b) => a.acquired.localeCompare(b.acquired)),
  };
}

export async function fetchAnalysis(
  region: RegionId,
  signal?: AbortSignal,
): Promise<NisarAnalysis> {
  const res = await fetch(`/data/nisar/${region}/index.json`, signal ? { signal } : {});
  if (!res.ok) throw new Error(`NISAR analysis unavailable (${res.status})`);
  return parseAnalysis(await res.json());
}

/** Share of the sector that changed since the previous pass; null if it wasn't compared. */
export function changedShare(m: NisarSectorMeasure | undefined): number | null {
  if (m?.brighterPct == null || m.darkerPct == null) return null;
  return Math.round((m.brighterPct + m.darkerPct) * 10) / 10;
}

export interface ChangeEvent {
  date: string;
  sectorId: string;
  sector: string;
  brighterPct: number;
  darkerPct: number;
}

/** Sectors with notable radar change, newest first. */
export function changeEvents(
  passes: NisarPass[],
  sectors: { id: string; name: string }[],
): ChangeEvent[] {
  return [...passes].reverse().flatMap((pass) =>
    sectors.flatMap((sector) => {
      const m = pass.sectors[sector.id];
      const share = changedShare(m);
      if (share == null || share < EVENT_SHARE_PCT) return [];
      return [
        {
          date: pass.acquired,
          sectorId: sector.id,
          sector: sector.name,
          brighterPct: m!.brighterPct!,
          darkerPct: m!.darkerPct!,
        },
      ];
    }),
  );
}

/** Average changed area across measured sectors, one point per compared pass. */
export function regionChangeSeries(passes: NisarPass[]) {
  return passes.flatMap((pass) => {
    const measured = Object.values(pass.sectors).filter((m) => changedShare(m) != null);
    if (measured.length === 0) return [];
    const mean = (key: "brighterPct" | "darkerPct") =>
      Math.round((measured.reduce((sum, m) => sum + m[key]!, 0) / measured.length) * 100) / 100;
    return [{ date: pass.acquired, brighter: mean("brighterPct"), darker: mean("darkerPct") }];
  });
}

/** Index of the pass this one was actually compared with, which may be several entries back. */
export function previousPassIndex(passes: NisarPass[], index: number): number {
  const previous = passes[index]?.previousAcquired;
  const found = previous ? passes.findIndex((p) => p.acquired === previous) : -1;
  return found >= 0 ? found : Math.max(0, index - 1);
}
