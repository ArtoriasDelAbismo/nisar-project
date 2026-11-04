<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- All telemetry is simulated client-side by deterministic seeded generators in `src/data/generators/` (fixed REF_DATE) — keeps SSR/hydration identical and avoids large static GeoJSON. The one exception is the map's `nisar` layer (`src/lib/nisar.ts`): real ASF catalog data and quick-look images, fetched client-side only and kept out of hazard scoring.
- Hazard scoring = weighted sum of normalized factors defined in `src/config/hazardModels.ts`; UI must show contributions transparently.
- Map shows aggregated sector polygons only, never individual shelter points (data-ethics requirement).
- MapLibre loads only client-side via `LazyMap` (React.lazy + ClientOnly); its worker is served from `public/maplibre-gl-worker.mjs` and must match the installed maplibre-gl version.
- MapView observes its container size and resizes MapLibre to keep canvases aligned with flexible dashboard panels.
- User settings, rules and alert lifecycle live in `src/lib/store.tsx` (React context persisted to localStorage).
- Localize Spanish at render time through `useI18n` and the shared Spanish dictionary; keep generator values and stored domain identifiers unchanged so language never changes simulation or alert logic.
