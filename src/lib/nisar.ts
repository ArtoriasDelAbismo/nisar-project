import { z } from "zod";
import type { RegionId } from "@/data/generators/regions";
import { REGIONS } from "@/data/generators/regions";

/**
 * Live NISAR catalog + browse imagery from NASA's Alaska Satellite Facility (ASF).
 * Both endpoints are public and CORS-enabled, so this runs in the browser with no credentials.
 * Browse PNGs are quick-look visuals (~180 m/px), not calibrated measurements: don't feed
 * their pixel values into hazard scoring.
 */
const ASF_SEARCH_URL = "https://api.daac.asf.alaska.edu/services/search/param";
const MAX_RESULTS = 40;
/** Scenes offered in the UI. */
const MAX_SCENES = 12;

const featureSchema = z.object({
  geometry: z.object({
    type: z.literal("Polygon"),
    coordinates: z.array(z.array(z.array(z.number()))),
  }),
  properties: z.object({
    fileID: z.string(),
    startTime: z.string(),
    pathNumber: z.number(),
    flightDirection: z.string(),
    frameCoverage: z.string().nullish(),
    collectionName: z.string(),
    browse: z.array(z.string()).nullish(),
  }),
});
const responseSchema = z.object({ features: z.array(z.unknown()) });

export interface NisarScene {
  id: string;
  acquired: string;
  track: number;
  direction: "Ascending" | "Descending";
  /** e.g. PROVISIONAL or BETA. */
  quality: string;
  browseUrl: string;
  footprint: [number, number][];
}

export function parseScenes(json: unknown): NisarScene[] {
  const { features } = responseSchema.parse(json);
  const seen = new Set<string>();
  const scenes: NisarScene[] = [];
  for (const raw of features) {
    const parsed = featureSchema.safeParse(raw);
    if (!parsed.success) continue; // e.g. a MultiPolygon scene: skip it, keep the rest
    const { properties: p, geometry } = parsed.data;
    const browseUrl = p.browse?.find((u) => u.endsWith("_LATLON.png"));
    if (!browseUrl || p.frameCoverage !== "Full") continue;
    const key = `${p.startTime.slice(0, 10)}-${p.pathNumber}`;
    if (seen.has(key)) continue; // reprocessed duplicates of the same pass
    seen.add(key);
    scenes.push({
      id: p.fileID,
      acquired: p.startTime,
      track: p.pathNumber,
      direction: p.flightDirection === "ASCENDING" ? "Ascending" : "Descending",
      quality: p.collectionName.match(/GCOV_([A-Z]+)_/)?.[1] ?? "UNKNOWN",
      browseUrl,
      footprint: (geometry.coordinates[0] ?? []).map((c) => [c[0]!, c[1]!]),
    });
  }
  return scenes.sort((a, b) => b.acquired.localeCompare(a.acquired)).slice(0, MAX_SCENES);
}

export async function fetchScenes(region: RegionId, signal?: AbortSignal): Promise<NisarScene[]> {
  const [lon, lat] = REGIONS[region].center;
  const params = new URLSearchParams({
    dataset: "NISAR",
    processingLevel: "GCOV",
    intersectsWith: `POINT(${lon} ${lat})`,
    maxResults: String(MAX_RESULTS),
    output: "geojson",
  });
  const res = await fetch(`${ASF_SEARCH_URL}?${params}`, signal ? { signal } : {});
  if (!res.ok) throw new Error(`ASF search failed (${res.status})`);
  return parseScenes(await res.json());
}

/** Corners in MapLibre order: top-left, top-right, bottom-right, bottom-left. */
export type ImageCorners = [[number, number], [number, number], [number, number], [number, number]];

export interface NisarImage {
  sceneId: string;
  image: ImageBitmap;
  corners: ImageCorners;
}

/** Rows/columns need this many data pixels to count, so stray specks can't widen the fit. */
const MIN_EDGE_PIXELS = 3;
/** Data this close to the border means the frame was clipped and its extent can't be trusted. */
const CLIPPED_MARGIN_PX = 2;
/** Allowed deviation of pixel aspect from cos(latitude); the browse grid is square on the ground. */
const ASPECT_TOLERANCE = 0.015;

/**
 * Locates a LATLON browse image on the map. Its exact georeferencing lives in a KML behind
 * Earthdata Login, so instead we match the extent of the non-black pixels to the public
 * footprint's bounding box. Returns null when the image fails the sanity checks: a wrongly
 * placed radar image is worse than none.
 */
export function fitCorners(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  footprint: [number, number][],
): ImageCorners | null {
  const rows = new Int32Array(height);
  const cols = new Int32Array(width);
  for (let y = 0, i = 0; y < height; y++) {
    for (let x = 0; x < width; x++, i += 4) {
      if (rgba[i]! + rgba[i + 1]! + rgba[i + 2]! > 0) {
        rows[y]!++;
        cols[x]!++;
      }
    }
  }
  const firstOf = (a: Int32Array) => a.findIndex((n) => n >= MIN_EDGE_PIXELS);
  const lastOf = (a: Int32Array) => {
    for (let i = a.length - 1; i >= 0; i--) if (a[i]! >= MIN_EDGE_PIXELS) return i;
    return -1;
  };
  const [x0, x1, y0, y1] = [firstOf(cols), lastOf(cols), firstOf(rows), lastOf(rows)] as [
    number,
    number,
    number,
    number,
  ];
  if (x0 < 0 || y0 < 0) return null;
  if (Math.min(x0, y0, width - 1 - x1, height - 1 - y1) <= CLIPPED_MARGIN_PX) return null;

  const lons = footprint.map((c) => c[0]);
  const lats = footprint.map((c) => c[1]);
  const [west, east, south, north] = [
    Math.min(...lons),
    Math.max(...lons),
    Math.min(...lats),
    Math.max(...lats),
  ];
  const degPerPxX = (east - west) / (x1 - x0 + 1);
  const degPerPxY = (north - south) / (y1 - y0 + 1);
  const expectedAspect = Math.cos((((north + south) / 2) * Math.PI) / 180);
  if (Math.abs(degPerPxY / degPerPxX / expectedAspect - 1) > ASPECT_TOLERANCE) return null;

  const left = west - x0 * degPerPxX;
  const right = west + (width - x0) * degPerPxX;
  const top = north + y0 * degPerPxY;
  const bottom = north - (height - y0) * degPerPxY;
  return [
    [left, top],
    [right, top],
    [right, bottom],
    [left, bottom],
  ];
}

/** Makes nodata padding transparent so it doesn't cover the basemap. */
export function maskNoData(rgba: Uint8ClampedArray) {
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i]! + rgba[i + 1]! + rgba[i + 2]! === 0) rgba[i + 3] = 0;
  }
}

export class NisarPlacementError extends Error {}

export async function loadSceneImage(scene: NisarScene, signal?: AbortSignal): Promise<NisarImage> {
  const res = await fetch(scene.browseUrl, signal ? { signal } : {});
  if (!res.ok) throw new Error(`Browse image failed (${res.status})`);
  const bitmap = await createImageBitmap(await res.blob());
  const { width, height } = bitmap;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const pixels = ctx.getImageData(0, 0, width, height);
  const corners = fitCorners(pixels.data, width, height, scene.footprint);
  if (!corners) throw new NisarPlacementError(scene.id);
  maskNoData(pixels.data);
  return { sceneId: scene.id, image: await createImageBitmap(pixels), corners };
}
