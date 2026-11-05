import type * as GeoJSON from "geojson";
import { rng, round } from "./prng";
import type { RegionId } from "./regions";
import { generateSectors } from "./sectors";
import { generateFacilities } from "./facilities";
import type { SectorScore } from "@/lib/scoring";

type FC = GeoJSON.FeatureCollection;

export function sectorsGeo(region: RegionId, scores: SectorScore[]): FC {
  const byId = new Map(scores.map((s) => [s.sector.id, s.score]));
  return {
    type: "FeatureCollection",
    features: generateSectors(region).map((s) => ({
      type: "Feature",
      id: Number(s.id.slice(3)),
      properties: {
        id: s.id,
        name: s.name,
        population: s.population,
        density: s.density,
        label: `${s.name}\n${(s.population / 1000).toFixed(1)}k`,
        risk: byId.get(s.id) ?? 0,
      },
      geometry: { type: "Polygon", coordinates: [s.polygon] },
    })),
  };
}

export function centroidsGeo(region: RegionId, scores: SectorScore[]): FC {
  const byId = new Map(scores.map((s) => [s.sector.id, s.score]));
  return {
    type: "FeatureCollection",
    features: generateSectors(region).map((s) => ({
      type: "Feature",
      properties: { id: s.id, name: s.name, label: `${s.name}\n${(s.population / 1000).toFixed(1)}k`, risk: byId.get(s.id) ?? 0 },
      geometry: { type: "Point", coordinates: s.centroid },
    })),
  };
}

/** Drainage / flood accumulation corridors (HAND < 2 m proxy). */
export function drainageGeo(region: RegionId): FC {
  const r = rng(`drain-${region}`);
  const feats: GeoJSON.Feature[] = [];
  if (region === "gaza") {
    for (let i = 0; i < 5; i++) {
      const lat0 = 31.335 + i * 0.022 + r() * 0.006;
      const coast = 34.255 + (lat0 - 31.33) * 0.95;
      const coords: [number, number][] = [];
      for (let k = 0; k <= 8; k++) {
        coords.push([round(coast + 0.045 - k * 0.0056, 5), round(lat0 + Math.sin(k * 0.9 + i) * 0.0025 - k * 0.0012, 5)]);
      }
      feats.push({ type: "Feature", properties: { name: `Wadi corridor ${i + 1}` }, geometry: { type: "LineString", coordinates: coords } });
    }
  } else {
    const rivers: [number, number][][] = [
      [[23.4, 49.2], [23.7, 49.25], [23.88, 49.27], [24.1, 49.36], [24.3, 49.45]],
      [[23.9, 49.75], [24.0, 49.83], [24.1, 49.95], [24.2, 50.2], [24.26, 50.45]],
    ];
    rivers.forEach((c, i) =>
      feats.push({
        type: "Feature",
        properties: { name: i ? "Poltva / Bug corridor" : "Stryi river corridor" },
        geometry: { type: "LineString", coordinates: c.map(([x, y]) => [x + (r() - 0.5) * 0.02, y]) },
      }),
    );
  }
  return { type: "FeatureCollection", features: feats };
}

/** Procedural terrain grid for slope/elevation classification. */
const terrainCache = new Map<RegionId, FC>();
export function terrainGeo(region: RegionId): FC {
  const hit = terrainCache.get(region);
  if (hit) return hit;
  const sectors = generateSectors(region);
  const lons = sectors.map((s) => s.centroid[0]);
  const lats = sectors.map((s) => s.centroid[1]);
  const pad = region === "gaza" ? 0.01 : 0.08;
  const [x0, x1, y0, y1] = [Math.min(...lons) - pad, Math.max(...lons) + pad, Math.min(...lats) - pad, Math.max(...lats) + pad];
  const n = 18;
  const dx = (x1 - x0) / n;
  const dy = (y1 - y0) / n;
  const r = rng(`terrain-${region}`);
  const feats: GeoJSON.Feature[] = [];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const x = x0 + i * dx;
      const y = y0 + j * dy;
      const elev =
        region === "gaza"
          ? Math.max(0, (i / n) * 45 + Math.sin(j * 0.7) * 4 + r() * 6)
          : 220 + Math.sin(i * 0.5) * 60 + (1 - j / n) * 90 + r() * 30;
      feats.push({
        type: "Feature",
        properties: { elev: round(elev, 0) },
        geometry: { type: "Polygon", coordinates: [[[x, y], [x + dx, y], [x + dx, y + dy], [x, y + dy], [x, y]]] },
      });
    }
  const fc: FC = { type: "FeatureCollection", features: feats };
  terrainCache.set(region, fc);
  return fc;
}

export function facilitiesGeo(region: RegionId): FC {
  return {
    type: "FeatureCollection",
    features: generateFacilities(region).map((f) => ({
      type: "Feature",
      properties: { id: f.id, name: f.name, type: f.type, status: f.status },
      geometry: { type: "Point", coordinates: f.coord },
    })),
  };
}

/** Elevation lookup for the inspector (nearest terrain cell). */
export function sampleElevation(region: RegionId, lon: number, lat: number) {
  const fc = terrainGeo(region);
  let best = 0;
  let bd = Infinity;
  fc.features.forEach((f: GeoJSON.Feature) => {
    const c = (f.geometry as GeoJSON.Polygon).coordinates[0]![0]!;
    const dd = (c[0]! - lon) ** 2 + (c[1]! - lat) ** 2;
    if (dd < bd) {
      bd = dd;
      best = f.properties!["elev"];
    }
  });
  return best;
}
