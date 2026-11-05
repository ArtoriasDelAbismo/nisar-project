// Exports the app's sector polygons so the Python pipeline measures exactly what the map draws.
import { mkdirSync, writeFileSync } from "node:fs";
import { generateSectors } from "../src/data/generators/sectors";
import { REGIONS, type RegionId } from "../src/data/generators/regions";

const outDir = new URL("./aoi/", import.meta.url);
mkdirSync(outDir, { recursive: true });
for (const region of Object.keys(REGIONS) as RegionId[]) {
  const sectors = generateSectors(region).map(({ id, name, polygon }) => ({ id, name, polygon }));
  writeFileSync(new URL(`${region}.json`, outDir), `${JSON.stringify({ region, sectors }, null, 2)}\n`);
  console.log(`${region}: ${sectors.length} sectors`);
}
