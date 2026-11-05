import { rng, round, clamp } from "./prng";
import { REGIONS, type RegionId } from "./regions";

export interface Sector {
  id: string;
  name: string;
  district: string;
  centroid: [number, number];
  polygon: [number, number][];
  population: number;
  areaKm2: number;
  density: number; // people / km2
  elevation: number; // m
  slope: number; // degrees
  hand: number; // Height Above Nearest Drainage, m
  shelterMix: Record<string, number>; // pct, sums to 100
  shelterUnits: number;
  materialVuln: number; // 0..1
  elderlyShare: number; // 0..1 (60+)
  coastalExposure: number; // 0..1
  delta30: number; // 30-day population change
}

const GAZA_NAMES = [
  ["North Mawasi", 4],
  ["South Mawasi", 4],
  ["Coastal Strip", 4],
  ["Deir al-Balah West", 4],
] as const;

const LVIV_CLUSTERS: { name: string; district: string; c: [number, number] }[] = [
  { name: "Sykhiv Modular Town", district: "Lviv City", c: [24.06, 49.79] },
  { name: "Lviv Centre Dormitories", district: "Lviv City", c: [24.03, 49.84] },
  { name: "Zaliznychnyi Facilities", district: "Lviv City", c: [23.97, 49.83] },
  { name: "Shevchenkivskyi North", district: "Lviv City", c: [24.03, 49.88] },
  { name: "Stryi Central", district: "Stryi", c: [23.85, 49.26] },
  { name: "Stryi Rural Ring", district: "Stryi", c: [23.93, 49.31] },
  { name: "Drohobych Collective", district: "Drohobych", c: [23.51, 49.35] },
  { name: "Truskavets Sanatoria", district: "Drohobych", c: [23.5, 49.28] },
  { name: "Chervonohrad Centre", district: "Chervonohrad", c: [24.23, 50.39] },
  { name: "Sokal Outskirts", district: "Chervonohrad", c: [24.28, 50.48] },
];

function blob(r: () => number, c: [number, number], rx: number, ry: number, n = 9) {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 0.75 + r() * 0.4;
    pts.push([round(c[0] + Math.cos(a) * rx * k, 5), round(c[1] + Math.sin(a) * ry * k, 5)]);
  }
  pts.push(pts[0]!);
  return pts;
}

function mix(r: () => number, types: string[], bias: number[]): Record<string, number> {
  const raw = bias.map((b) => b * (0.7 + r() * 0.6));
  const s = raw.reduce((a, b) => a + b, 0);
  const pct = raw.map((v) => Math.round((v / s) * 100));
  pct[0] = pct[0]! + 100 - pct.reduce((a, b) => a + b, 0);
  return Object.fromEntries(types.map((t, i) => [t, pct[i] ?? 0]));
}

const cache = new Map<RegionId, Sector[]>();

export function generateSectors(region: RegionId): Sector[] {
  const hit = cache.get(region);
  if (hit) return hit;
  const meta = REGIONS[region];
  const r = rng(`sectors-${region}`);
  const out: Sector[] = [];

  if (region === "gaza") {
    // Coast runs SW→NE; sectors laid in bands inland from the shoreline.
    const weights: number[] = [];
    let idx = 0;
    GAZA_NAMES.forEach(([group, n], gi) => {
      for (let k = 0; k < n; k++) {
        const lat = 31.33 + gi * 0.025 + (k % 2) * 0.012 + r() * 0.003;
        const coastLon = 34.255 + (lat - 31.33) * 0.95;
        const col = Math.floor(k / 2) + (group === "Coastal Strip" ? 0 : 1);
        const lon = coastLon + 0.006 + col * 0.011 + r() * 0.002;
        const elevation = round(2 + col * 6 + r() * 10, 1);
        const hand = round(clamp(0.4 + col * 1.6 + r() * 2.5, 0.2, 9), 2);
        const w = 0.6 + r();
        weights.push(w);
        out.push({
          id: `GZ-${String(++idx).padStart(2, "0")}`,
          name: `${group} ${String.fromCharCode(65 + k)}`,
          district: group,
          centroid: [round(lon, 5), round(lat, 5)],
          polygon: blob(r, [lon, lat], 0.0055, 0.0055),
          population: 0,
          areaKm2: round(0.9 + r() * 0.8, 2),
          density: 0,
          elevation,
          slope: round(0.4 + r() * 3.2, 1),
          hand,
          shelterMix: mix(r, meta.shelterTypes, [0.78, 0.15, 0.07]),
          shelterUnits: 0,
          materialVuln: round(0.65 + r() * 0.3, 2),
          elderlyShare: round(0.05 + r() * 0.06, 3),
          coastalExposure: round(clamp(1 - col * 0.35 + r() * 0.1), 2),
          delta30: 0,
        });
      }
    });
    const tw = weights.reduce((a, b) => a + b, 0);
    out.forEach((s, i) => {
      s.population = Math.round((meta.totalDisplaced * weights[i]!) / tw);
      s.shelterUnits = Math.round((s.population / 5.6) * ((s.shelterMix["Makeshift tent"] ?? 0) / 100 + 0.2));
    });
  } else {
    const weights: number[] = [];
    LVIV_CLUSTERS.forEach((c, i) => {
      const w = c.name.includes("Sykhiv") ? 2.2 : 0.6 + r() * 1.2;
      weights.push(w);
      const elevation = round(c.district === "Drohobych" ? 310 + r() * 120 : 240 + r() * 90, 0);
      out.push({
        id: `LV-${String(i + 1).padStart(2, "0")}`,
        name: c.name,
        district: c.district,
        centroid: c.c,
        polygon: blob(r, c.c, 0.035, 0.022),
        population: 0,
        areaKm2: round(4 + r() * 9, 1),
        density: 0,
        elevation,
        slope: round(1 + r() * 7, 1),
        hand: round(3 + r() * 14, 1),
        shelterMix: c.name.includes("Modular")
          ? mix(r, meta.shelterTypes, [0.8, 0.12, 0.08])
          : mix(r, meta.shelterTypes, [0.15, 0.45, 0.4]),
        shelterUnits: 0,
        materialVuln: round(c.name.includes("Modular") ? 0.75 + r() * 0.15 : 0.3 + r() * 0.35, 2),
        elderlyShare: round(0.14 + r() * 0.14, 3),
        coastalExposure: round(0.2 + r() * 0.4, 2),
        delta30: 0,
      });
    });
    const tw = weights.reduce((a, b) => a + b, 0);
    out.forEach((s, i) => {
      s.population = Math.round((meta.totalDisplaced * weights[i]!) / tw);
      s.shelterUnits = Math.round(s.population / 2.4);
    });
  }

  out.forEach((s) => {
    s.density = Math.round(s.population / s.areaKm2);
    s.delta30 = Math.round(s.population * ((r() - 0.35) * 0.08));
  });

  cache.set(region, out);
  return out;
}
