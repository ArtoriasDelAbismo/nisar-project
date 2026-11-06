## Project rules
- All telemetry is simulated client-side by deterministic seeded generators in `src/data/generators/` (fixed REF_DATE) — keeps SSR/hydration identical and avoids large static GeoJSON. The exception is NISAR, which is real: `pipeline/` writes measurements and images to `public/data/nisar/`, and `src/lib/nisar.ts` reads live ASF catalog data. Both load client-side only and stay out of hazard scoring. Present radar change as a prompt for review, never as confirmed structure change. Sectors, population and facilities stay simulated.
- Hazard scoring = weighted sum of normalized factors defined in `src/config/hazardModels.ts`; UI must show contributions transparently.
- Map shows population only as aggregated sector values on a hexagon grid, never individual shelter points (data-ethics requirement). Every cell in a sector carries the same value; never add variation inside a sector that the data doesn't have.
- Deployed on Netlify; `vite.config.ts` sets the Nitro preset.
- MapLibre loads only client-side via `LazyMap` (React.lazy + ClientOnly); its worker is served from `public/maplibre-gl-worker.mjs` and must match the installed maplibre-gl version.
- MapView observes its container size and resizes MapLibre to keep canvases aligned with flexible dashboard panels.
- User settings, rules and alert lifecycle live in `src/lib/store.tsx` (React context persisted to localStorage).
- Localize Spanish at render time through `useI18n` and the shared Spanish dictionary; keep generator values and stored domain identifiers unchanged so language never changes simulation or alert logic.
