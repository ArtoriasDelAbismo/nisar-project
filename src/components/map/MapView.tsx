import type * as GeoJSON from "geojson";
import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// Worker is served from /public so it loads as a plain module worker (dev + prod).
maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
import { REGIONS, type RegionId } from "@/data/generators/regions";
import {
  centroidsGeo,
  drainageGeo,
  facilitiesGeo,
  facilitySummaryGeo,
  sectorsGeo,
  terrainGeo,
} from "@/data/generators/layers";
import type { NisarImage } from "@/lib/nisar";
import type { MapImage } from "@/lib/nisarAnalysis";
import type { SectorScore } from "@/lib/scoring";
import { addFacilityIcons, FACILITY_STATUS_COLORS } from "./facilityIcons";
import { LAYER_KEYS, type LayerKey, type LayerState } from "./layers";

export const BASEMAPS = {
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  light: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
};

// Colorblind-safe ramps (literal colors are required by the GL paint spec).
const RISK_RAMP = ["interpolate", ["linear"], ["get", "risk"], 0, "#9a9a9a", 40, "#9a9a9a", 55, "#e9a23b", 72, "#d7263d", 86, "#7b2cbf"];
// Relative to the region's densest sector, because Gaza and Lviv differ by about 100x.
const DENSITY_RAMP = ["interpolate", ["linear"], ["get", "densityLevel"], 0, "#134e4a", 0.4, "#0f766e", 0.7, "#14b8a6", 1, "#5eead4"];
const STATUS_COLOR = ["match", ["get", "status"], "Operational", FACILITY_STATUS_COLORS[0]!, "Degraded", FACILITY_STATUS_COLORS[1]!, FACILITY_STATUS_COLORS[2]!];
/** Keeps the counts beside each sector's hexagons instead of on top of them. */
const BADGE_OFFSET: [number, number] = [16, -16];
/** From this zoom, sector names and individual facility icons replace the per-sector counts. */
const DETAIL_ZOOM: Record<RegionId, number> = { gaza: 12.5, lviv: 9.5 };
const ELEV_RAMP = (region: RegionId) =>
  region === "gaza"
    ? ["interpolate", ["linear"], ["get", "elev"], 0, "#e8e8e8", 12, "#b0b0b0", 25, "#7a7a7a", 38, "#4a4a4a", 50, "#1c1c1c"]
    : ["interpolate", ["linear"], ["get", "elev"], 200, "#e8e8e8", 250, "#b0b0b0", 300, "#7a7a7a", 350, "#4a4a4a", 400, "#1c1c1c"];

interface Props {
  region: RegionId;
  scores: SectorScore[];
  layers: Record<LayerKey, LayerState>;
  nisar?: NisarImage | null | undefined;
  radar?: MapImage | null | undefined;
  change?: MapImage | null | undefined;
  basemap?: keyof typeof BASEMAPS | undefined;
  interactive?: boolean | undefined;
  selectedId?: string | null | undefined;
  onSelect?: ((id: string | null) => void) | undefined;
  onPointer?: ((lngLat: { lng: number; lat: number }) => void) | undefined;
  flyTo?: [number, number] | null | undefined;
  syncWith?: React.MutableRefObject<maplibregl.Map | null> | undefined;
  mapRef?: React.MutableRefObject<maplibregl.Map | null> | undefined;
}

/** Image layers bottom to top: wide context, then detail, then change. All sit under the sector grid. */
const IMAGE_LAYERS = ["nisar-raster", "radar-raster", "sar-change"];

function addImageLayer(map: maplibregl.Map, id: string, source: string) {
  if (map.getLayer(id)) return;
  const above = IMAGE_LAYERS.slice(IMAGE_LAYERS.indexOf(id) + 1).find((l) => map.getLayer(l));
  map.addLayer({ id, type: "raster", source, paint: { "raster-fade-duration": 0 } }, above ?? "sectors-fill");
}

function removeImage(map: maplibregl.Map, id: string, source: string) {
  if (map.getLayer(id)) map.removeLayer(id);
  if (map.getSource(source)) map.removeSource(source);
}

function syncMapImage(map: maplibregl.Map, id: string, source: string, image: MapImage | null | undefined) {
  if (!image) return removeImage(map, id, source);
  const existing = map.getSource(source) as maplibregl.ImageSource | undefined;
  if (!existing) map.addSource(source, { type: "image", url: image.url, coordinates: image.corners });
  else if (existing.url !== image.url) existing.updateImage({ url: image.url, coordinates: image.corners });
  addImageLayer(map, id, source);
}

function syncNisar(map: maplibregl.Map, nisar: NisarImage | null | undefined) {
  if (!nisar) return removeImage(map, "nisar-raster", "nisar");
  if (!map.getSource("nisar")) map.addSource("nisar", { type: "image", coordinates: nisar.corners });
  (map.getSource("nisar") as maplibregl.ImageSource).updateImage({ image: nisar.image, coordinates: nisar.corners });
  addImageLayer(map, "nisar-raster", "nisar");
}

function syncImages(map: maplibregl.Map, p: Props) {
  syncNisar(map, p.nisar);
  syncMapImage(map, "radar-raster", "radar", p.radar);
  syncMapImage(map, "sar-change", "sar", p.change);
}

function install(map: maplibregl.Map, p: Props) {
  const { region, scores } = p;
  const add = (id: string, data: GeoJSON.FeatureCollection) => {
    const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(data);
    else map.addSource(id, { type: "geojson", data });
  };
  add("terrain", terrainGeo(region));
  add("sectors", sectorsGeo(region, scores));
  add("centroids", centroidsGeo(region, scores));
  add("drainage", drainageGeo(region));
  add("facilities", facilitiesGeo(region));
  add("facility-summary", facilitySummaryGeo(region));
  addFacilityIcons(map);

  const L = (spec: maplibregl.LayerSpecification) => {
    if (!map.getLayer(spec.id)) map.addLayer(spec);
  };
  L({ id: "terrain-fill", type: "fill", source: "terrain", paint: { "fill-color": ELEV_RAMP(region) as never, "fill-opacity": 0.5 } });
  L({ id: "sectors-fill", type: "fill", source: "sectors", paint: { "fill-color": DENSITY_RAMP as never, "fill-opacity": 0.5 } });
  L({ id: "drainage-line", type: "line", source: "drainage", layout: { "line-cap": "round" }, paint: { "line-color": "#9a9a9a", "line-width": region === "gaza" ? 14 : 10, "line-opacity": 0.35, "line-blur": 4 } });
  L({ id: "hazard-heat", type: "heatmap", source: "centroids", paint: { "heatmap-weight": ["/", ["get", "risk"], 100] as never, "heatmap-radius": region === "gaza" ? 60 : 45, "heatmap-intensity": 1.2, "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(0,0,0,0)", 0.2, "#9a9a9a", 0.45, "#e9a23b", 0.7, "#d7263d", 1, "#7b2cbf"] as never, "heatmap-opacity": 0.6 } });
  L({ id: "risk-outline", type: "line", source: "sectors", paint: { "line-color": RISK_RAMP as never, "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 2.5, 0.8] as never } });
  L({ id: "facilities-pt", type: "symbol", source: "facilities", layout: { "icon-image": ["concat", "facility-", ["get", "type"], "-", ["get", "status"]] as never, "icon-allow-overlap": true } });
  L({ id: "facilities-badge", type: "circle", source: "facility-summary", paint: { "circle-radius": 10, "circle-translate": BADGE_OFFSET, "circle-color": "#0a0a0a", "circle-stroke-width": 1.5, "circle-stroke-color": STATUS_COLOR as never } });
  L({ id: "facilities-count", type: "symbol", source: "facility-summary", layout: { "text-field": ["get", "label"], "text-size": 9, "text-font": ["Open Sans Regular"] as never, "text-allow-overlap": true }, paint: { "text-color": "#f5f5f5", "text-translate": BADGE_OFFSET } });
  L({ id: "sector-labels", type: "symbol", source: "centroids", layout: { "text-field": ["get", "label"], "text-size": 10, "text-font": ["Open Sans Regular"] as never, "text-allow-overlap": false }, paint: { "text-color": "#e2e8f0", "text-halo-color": "#020617", "text-halo-width": 1.2 } });
  map.setLayerZoomRange("sector-labels", DETAIL_ZOOM[region], 24);
  map.setLayerZoomRange("facilities-pt", DETAIL_ZOOM[region], 24);
  map.setLayerZoomRange("facilities-badge", 0, DETAIL_ZOOM[region]);
  map.setLayerZoomRange("facilities-count", 0, DETAIL_ZOOM[region]);
  syncImages(map, p);
  applyVisibility(map, p.layers);
}

const LAYER_IDS: Record<LayerKey, string[]> = {
  sectors: ["sectors-fill", "sector-labels", "risk-outline"],
  sar: ["sar-change"],
  drainage: ["drainage-line"],
  terrain: ["terrain-fill"],
  facilities: ["facilities-pt", "facilities-badge", "facilities-count"],
  hazard: ["hazard-heat"],
  nisar: ["nisar-raster"],
  radar: ["radar-raster"],
};
const OPACITY_PROP: Record<string, [string, number]> = {
  "sectors-fill": ["fill-opacity", 0.5],
  "sar-change": ["raster-opacity", 1],
  "drainage-line": ["line-opacity", 0.5],
  "terrain-fill": ["fill-opacity", 0.7],
  "facilities-pt": ["icon-opacity", 1],
  "facilities-badge": ["circle-opacity", 1],
  "facilities-count": ["text-opacity", 1],
  "hazard-heat": ["heatmap-opacity", 0.85],
  "nisar-raster": ["raster-opacity", 1],
  "radar-raster": ["raster-opacity", 1],
};

function applyVisibility(map: maplibregl.Map, layers: Props["layers"]) {
  LAYER_KEYS.forEach((k) => {
    LAYER_IDS[k].forEach((id) => {
      if (!map.getLayer(id)) return;
      map.setLayoutProperty(id, "visibility", layers[k].on ? "visible" : "none");
      const op = OPACITY_PROP[id];
      if (op) map.setPaintProperty(id, op[0] as never, (op[1] * layers[k].opacity) as never);
    });
  });
}

export default function MapView(p: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const props = useRef(p);
  props.current = p;

  useEffect(() => {
    if (!el.current) return;
    const meta = REGIONS[p.region];
    const m = new maplibregl.Map({
      container: el.current,
      style: BASEMAPS[p.basemap ?? "dark"],
      center: meta.center,
      zoom: meta.zoom,
      attributionControl: { compact: true },
      interactive: p.interactive !== false,
    });
    map.current = m;
    const resizeObserver = new ResizeObserver(() => m.resize());
    resizeObserver.observe(el.current);
    if (p.mapRef) p.mapRef.current = m;
    if (p.interactive !== false) m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.on("style.load", () => install(m, props.current));
    let selected: number | null = null;
    m.on("click", "sectors-fill", (e) => {
      const f = e.features?.[0];
      if (!f) return;
      props.current.onSelect?.(f.properties["id"] as string);
    });
    m.on("click", (e) => {
      const hits = m.queryRenderedFeatures(e.point, { layers: ["sectors-fill"] });
      if (!hits.length) props.current.onSelect?.(null);
    });
    m.on("mousemove", (e) => props.current.onPointer?.(e.lngLat));
    m.on("mouseenter", "sectors-fill", () => (m.getCanvas().style.cursor = "pointer"));
    m.on("mouseleave", "sectors-fill", () => (m.getCanvas().style.cursor = ""));
    m.on("click", "facilities-pt", (e) => {
      const f = e.features?.[0];
      if (!f) return;
      new maplibregl.Popup({ closeButton: false })
        .setLngLat(e.lngLat)
        .setHTML(`<b>${f.properties["name"]}</b><br/>${f.properties["status"]}`)
        .addTo(m);
    });
    m.on("click", "facilities-badge", (e) => {
      m.flyTo({ center: e.lngLat, zoom: DETAIL_ZOOM[props.current.region] + 0.5 });
    });
    m.on("mouseenter", "facilities-badge", () => (m.getCanvas().style.cursor = "pointer"));
    m.on("mouseleave", "facilities-badge", () => (m.getCanvas().style.cursor = ""));
    (m as unknown as { _sel: (n: number | null) => void })._sel = (n) => {
      if (selected != null) m.setFeatureState({ source: "sectors", id: selected }, { selected: false });
      selected = n;
      if (n != null) m.setFeatureState({ source: "sectors", id: n }, { selected: true });
    };
    return () => {
      resizeObserver.disconnect();
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // region change → reposition + reinstall
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const meta = REGIONS[p.region];
    m.jumpTo({ center: meta.center, zoom: meta.zoom });
    if (m.isStyleLoaded()) install(m, p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.region]);

  useEffect(() => {
    const m = map.current;
    if (m?.isStyleLoaded() && m.getSource("sectors")) install(m, p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.scores]);

  useEffect(() => {
    const m = map.current;
    // Not isStyleLoaded(): it stays false while tiles load. style.load's install covers a pending style.
    if (!m?.getLayer("sectors-fill")) return;
    syncImages(m, p);
    applyVisibility(m, props.current.layers);
  }, [p.nisar, p.radar, p.change]);

  useEffect(() => {
    const m = map.current;
    if (m?.isStyleLoaded()) applyVisibility(m, p.layers);
  }, [p.layers]);

  useEffect(() => {
    map.current?.setStyle(BASEMAPS[p.basemap ?? "dark"]);
  }, [p.basemap]);

  useEffect(() => {
    const m = map.current as unknown as { _sel?: (n: number | null) => void } | null;
    if (!m?._sel || !map.current?.getSource("sectors")) return;
    m._sel(p.selectedId ? Number(p.selectedId.slice(3)) : null);
  }, [p.selectedId]);

  useEffect(() => {
    if (p.flyTo) map.current?.flyTo({ center: p.flyTo, zoom: p.region === "gaza" ? 13.5 : 10.5 });
  }, [p.flyTo, p.region]);

  // camera sync for swipe-compare
  useEffect(() => {
    const other = p.syncWith?.current;
    const m = map.current;
    if (!other || !m) return;
    const sync = () => m.jumpTo({ center: other.getCenter(), zoom: other.getZoom(), bearing: other.getBearing(), pitch: other.getPitch() });
    sync();
    other.on("move", sync);
    return () => {
      other.off("move", sync);
    };
  });

  return (
    <div className="absolute inset-0">
      <div ref={el} className="h-full w-full" />
    </div>
  );
}
