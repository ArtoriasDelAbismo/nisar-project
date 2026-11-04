import { useI18n } from "@/lib/i18n";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useMemo, useRef, useState } from "react";
import type * as maplibregl from "maplibre-gl";
import { ChevronLeft, ChevronRight, Columns2, Search, X } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { LazyMap } from "@/components/map/LazyMap";
import { decodeLayers, encodeLayers, LAYER_KEYS, LAYER_LABELS, type LayerKey } from "@/components/map/layers";
import { useRegion } from "@/lib/useRegion";
import { useNisar } from "@/lib/useNisar";
import { NisarPlacementError } from "@/lib/nisar";
import { fmtNum, useStore } from "@/lib/store";
import { sarPasses } from "@/data/generators/timeseries";
import { sampleElevation } from "@/data/generators/layers";
import { CHART, RiskPill, SimBadge } from "@/components/ui-kit";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const search = z.object({
  layers: z.string().optional(),
  op: z.string().optional(),
  pass: z.number().int().min(0).max(11).optional(),
  sector: z.string().optional(),
  base: z.enum(["dark", "light"]).optional(),
});

export const Route = createFileRoute("/map")({
  validateSearch: search,
  head: () => ({
    meta: [
      { title: "Map Explorer — Camp Sentinel" },
      { name: "description", content: "Geospatial workspace with SAR change detection, drainage, terrain and hazard layers." },
      { property: "og:title", content: "Camp Sentinel Map Explorer" },
      { property: "og:description", content: "Geospatial workspace with SAR change detection, drainage, terrain and hazard layers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MapExplorer,
});

function NisarControls({ nisar }: { nisar: ReturnType<typeof useNisar> }) {
  const { t, date } = useI18n();
  const status = nisar.error instanceof NisarPlacementError
    ? t("This pass can't be placed accurately on the map. Choose another.")
    : nisar.error
      ? t("NISAR data is unavailable right now.")
      : nisar.loading
        ? t("Loading NISAR pass…")
        : nisar.scenes.length === 0
          ? t("No NISAR passes found for this region.")
          : null;
  return (
    <div className="mt-2 space-y-1.5">
      {nisar.scenes.length > 0 && (
        <Select value={nisar.scene?.id ?? ""} onValueChange={nisar.select}>
          <SelectTrigger className="h-8 text-xs" aria-label={t("NISAR pass")}><SelectValue /></SelectTrigger>
          <SelectContent>
            {nisar.scenes.map((s) => (
              <SelectItem key={s.id} value={s.id} className="text-xs">
                {t(date(new Date(s.acquired), "dd MMM yyyy"))} · {t("Track")} {s.track}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {status && <p role="status" className="text-[11px] text-muted-foreground">{status}</p>}
      {nisar.scene && <p className="text-[11px] text-muted-foreground">{t(nisar.scene.direction)} · {nisar.scene.quality}</p>}
      <p className="text-[11px] text-muted-foreground">{t("Real quick-look image, about 180 m per pixel. Not used in hazard scores. NASA/JPL-Caltech/ISRO via ASF.")}</p>
    </div>
  );
}

function MapExplorer() {
  const { t, date, locale } = useI18n();
  const sp = Route.useSearch();
  const nav = useNavigate({ from: "/map" });
  const { region, scores, facilities, meta } = useRegion();
  const passes = sarPasses();
  const layers = useMemo(() => decodeLayers(sp.layers, sp.op), [sp.layers, sp.op]);
  const pass = sp.pass ?? 11;
  const nisar = useNisar(region, layers.nisar.on);
  const [panel, setPanel] = useState(true);
  const [compare, setCompare] = useState(false);
  const [swipe, setSwipe] = useState(50);
  const [cursor, setCursor] = useState<{ lng: number; lat: number } | null>(null);
  const [q, setQ] = useState("");
  const [fly, setFly] = useState<[number, number] | null>(null);
  const primary = useRef<maplibregl.Map | null>(null);
  const selected = scores.find((s) => s.sector.id === sp.sector);

  const update = (k: LayerKey, patch: Partial<{ on: boolean; opacity: number }>) => {
    const next = { ...layers, [k]: { ...layers[k], ...patch } };
    nav({ search: (p) => ({ ...p, ...encodeLayers(next) }), replace: true });
  };
  const select = (id: string | null) => nav({ search: (p) => ({ ...p, sector: id ?? undefined }), replace: true });

  const results = q.length > 1
    ? [
        ...scores.filter((s) => s.sector.name.toLowerCase().includes(q.toLowerCase()) || s.sector.id.toLowerCase().includes(q.toLowerCase())).map((s) => ({ id: s.sector.id, label: s.sector.name, kind: "Sector", c: s.sector.centroid, sector: s.sector.id })),
        ...facilities.filter((f) => f.name.toLowerCase().includes(q.toLowerCase())).map((f) => ({ id: f.id, label: f.name, kind: "Facility", c: f.coord, sector: f.sectorId })),
      ].slice(0, 8)
    : [];

  const compareLayers = useMemo(() => ({ ...layers, sar: { on: true, opacity: layers.sar.opacity } }), [layers]);
  const comparePass = Math.max(0, pass - 1);

  return (
    <div className="relative h-full overflow-hidden">
      <div className="absolute inset-0">
        <LazyMap region={region} scores={scores} layers={compare ? compareLayers : layers} pass={pass} nisar={nisar.image} basemap={sp.base} selectedId={sp.sector} onSelect={select} onPointer={setCursor} flyTo={fly} mapRef={primary} />
      </div>
      {compare && (
        <>
          <div className="pointer-events-none absolute inset-0" style={{ clipPath: `inset(0 ${100 - swipe}% 0 0)` }}>
            <LazyMap region={region} scores={scores} layers={compareLayers} pass={comparePass} nisar={nisar.image} basemap={sp.base} interactive={false} syncWith={primary} />
          </div>
          <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-primary" style={{ left: `${swipe}%` }}>
            <span className="absolute top-3 -translate-x-full whitespace-nowrap rounded-s bg-primary px-2 py-0.5 text-[10px] text-primary-foreground num">{t(date(new Date(passes[comparePass]!), "dd MMM"))}</span>
            <span className="absolute top-3 whitespace-nowrap rounded-e bg-card px-2 py-0.5 text-[10px] num">{t(date(new Date(passes[pass]!), "dd MMM"))}</span>
          </div>
          <input type="range" min={0} max={100} value={swipe} onChange={(e) => setSwipe(Number(e.target.value))} aria-label={t("Swipe compare")} className="absolute inset-x-0 top-1/2 z-10 mx-auto w-full cursor-ew-resize opacity-0" />
        </>
      )}

      {/* search */}
      <div className="absolute start-1/2 top-3 z-20 w-80 -translate-x-1/2">
        <div className="relative">
          <Search className="pointer-events-none absolute start-2.5 top-2.5 z-10 size-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search sectors or facilities…")} className="h-9 bg-card/95 ps-8 backdrop-blur" />
        </div>
        {results.length > 0 && (
          <ul className="mt-1 rounded-md border bg-popover text-sm shadow-lg">
            {results.map((r) => (
              <li key={r.id}>
                <button className="flex w-full justify-between px-3 py-1.5 text-start hover:bg-accent" onClick={() => { setFly([r.c[0], r.c[1]]); select(r.sector); setQ(""); }}>
                  <span className="truncate">{t(r.label)}</span>
                  <span className="text-[10px] text-muted-foreground">{t(r.kind)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* layer panel */}
      <aside className={cn("absolute start-3 top-3 z-20 w-72 rounded-md border bg-card/95 backdrop-blur transition-transform", !panel && "-translate-x-[calc(100%+1rem)]")}>
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("Layers")}</span>
          <SimBadge />
        </div>
        <div className="space-y-3 p-3">
          {LAYER_KEYS.map((k) => (
            <div key={k}>
              <label className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-1.5">
                  {t(LAYER_LABELS[k])}
                  {k === "nisar" && <span className="rounded-sm border border-risk-low/50 bg-risk-low/10 px-1 text-[9px] font-semibold tracking-wider text-risk-low">{t("LIVE")}</span>}
                </span>
                <Switch checked={layers[k].on} onCheckedChange={(v) => update(k, { on: v })} />
              </label>
              {layers[k].on && (
                <Slider className="mt-2" value={[layers[k].opacity * 100]} min={10} max={100} step={5} onValueChange={([v]) => update(k, { opacity: (v ?? 100) / 100 })} />
              )}
              {k === "nisar" && layers.nisar.on && <NisarControls nisar={nisar} />}
            </div>
          ))}
          <div className="flex gap-1 border-t pt-3">
            {(["dark", "light"] as const).map((b) => (
              <Button key={b} size="sm" variant={(sp.base ?? "dark") === b ? "secondary" : "ghost"} className="h-7 flex-1 text-xs" onClick={() => nav({ search: (p) => ({ ...p, base: b }), replace: true })}>
                {b === "dark" ? "Dark" : "Topographic"}
              </Button>
            ))}
          </div>
          <Legend />
        </div>
      </aside>
      <button onClick={() => setPanel(!panel)} className="absolute top-16 z-30 rounded-e border bg-card p-1" style={{ left: panel ? "19.75rem" : 0 }} aria-label={t("Toggle layer panel")}>
        {panel ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
      </button>

      {/* inspector */}
      {selected && (
        <aside className="absolute end-14 top-3 z-20 max-h-[calc(100%-7rem)] w-80 overflow-y-auto rounded-md border bg-card/95 backdrop-blur">
          <div className="flex items-start justify-between border-b px-3 py-2">
            <div>
              <div className="text-[10px] text-muted-foreground num">{t(selected.sector.id)} {t("·")} {t(selected.sector.district)}</div>
              <div className="text-sm font-semibold">{t(selected.sector.name)}</div>
            </div>
            <button onClick={() => select(null)} aria-label={t("Close")}><X className="size-4" /></button>
          </div>
          <div className="space-y-3 p-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">{t("Peril index")}</span><RiskPill score={selected.score} /></div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              {[
                ["Population", fmtNum(selected.sector.population, locale)],
                ["Density /km²", fmtNum(selected.sector.density, locale)],
                ["Avg elevation", `${selected.sector.elevation} m`],
                ["Slope", `${selected.sector.slope}°`],
                ["HAND index", `${selected.sector.hand} m`],
                ["30-day Δ", fmtNum(selected.sector.delta30, locale)],
              ].map(([k, v]) => (
                <div key={k}><dt className="text-muted-foreground">{t(k)}</dt><dd className="num">{t(v)}</dd></div>
              ))}
            </dl>
            <div>
              <div className="mb-1 text-xs text-muted-foreground">{t("Shelter typology")}</div>
              <div className="flex h-2 overflow-hidden rounded-sm">
                {Object.entries(selected.sector.shelterMix).map(([k, v], i) => (
                  <div key={k} style={{ width: `${v}%`, background: `var(--chart-${i + 1})` }} />
                ))}
              </div>
              <ul className="mt-1.5 space-y-0.5 text-xs">
                {Object.entries(selected.sector.shelterMix).map(([k, v], i) => (
                  <li key={k} className="flex justify-between"><span className="flex items-center gap-1.5"><span className="size-2 rounded-sm" style={{ background: `var(--chart-${i + 1})` }} />{t(k)}</span><span className="num">{t(v)}{t("%")}</span></li>
                ))}
              </ul>
            </div>
            <div>
              <div className="mb-1 text-xs text-muted-foreground">{t("SAR footprint change per pass (%)")}</div>
              <div className="h-20">
                <ResponsiveContainer>
                  <LineChart data={selected.sector.sarTrend.map((v, i) => ({ i, v }))}>
                    <YAxis hide />
                    <Tooltip {...CHART.tooltip} />
                    <Line dataKey="v" stroke="var(--primary)" dot={false} strokeWidth={1.5} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </aside>
      )}

      {/* bottom scrubber */}
      <div className="absolute inset-x-3 bottom-3 z-20 rounded-md border bg-card/95 px-4 py-2 backdrop-blur">
        <div className="flex items-center gap-4">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{t("SAR pass")}</span>
          <div className="flex flex-1 gap-1">
            {passes.map((p, i) => (
              <button key={p} onClick={() => nav({ search: (s) => ({ ...s, pass: i }), replace: true })} className={cn("flex-1 rounded-sm py-1 text-[10px] num transition-colors", i === pass ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent")}>
                {t(date(new Date(p), "dd MMM"))}
              </button>
            ))}
          </div>
          <Button size="sm" variant={compare ? "secondary" : "outline"} className="h-7 text-xs" onClick={() => setCompare(!compare)}>
            <Columns2 className="size-3.5" /> {t("Swipe compare")}
          </Button>
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground num">
          <span>{cursor ? `${cursor.lat.toFixed(5)}°N ${cursor.lng.toFixed(5)}°E · elev ≈ ${sampleElevation(region, cursor.lng, cursor.lat)} m` : "move cursor over map to inspect"}</span>
          <span>{t(meta.short)} {t("· 12-day repeat cycle")}</span>
        </div>
      </div>
    </div>
  );
}

function Legend() {
  const { t, date, locale } = useI18n();
  const rows = [
    ["Risk", ["#9a9a9a", "#e9a23b", "#d7263d", "#7b2cbf"], ["Low", "Warn", "Crit", "Extr"]],
    ["SAR Δ", ["#b2182b", "#d6604d", "#f7f7f7", "#8a8a8a", "#4a4a4a"], ["Removal", "", "", "", "Expansion"]],
    ["Elev", ["#e8e8e8", "#b0b0b0", "#7a7a7a", "#4a4a4a", "#1c1c1c"], ["Low", "", "", "", "High"]],
  ] as const;
  return (
    <div className="space-y-1.5 border-t pt-3 text-[10px] text-muted-foreground">
      {rows.map(([k, cols, labels]) => (
        <div key={k}>
          <div className="flex items-center gap-2">
            <span className="w-9">{t(k)}</span>
            <div className="flex flex-1 overflow-hidden rounded-sm">{cols.map((c) => <span key={c} className="h-2 flex-1" style={{ background: c }} />)}</div>
          </div>
          <div className="ms-11 flex justify-between">{labels.filter(Boolean).map((l) => <span key={l}>{t(l)}</span>)}</div>
        </div>
      ))}
    </div>
  );
}
