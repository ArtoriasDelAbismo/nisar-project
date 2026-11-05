import { useI18n } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";
import { fmtTime, useStore } from "@/lib/store";
import { useNisarAnalysis } from "@/lib/useNisar";
import { REF_DATE } from "@/data/generators/prng";
import { PageHeader, SimBadge } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/sources")({
  head: () => ({
    meta: [
      { title: "Data Sources & Transparency — Camp Sentinel" },
      { name: "description", content: "Catalog of SAR, elevation, weather and humanitarian datasets with cadence, resolution and licensing." },
      { property: "og:title", content: "Camp Sentinel Data Sources" },
      { property: "og:description", content: "SAR, elevation, weather and humanitarian datasets with cadence and licensing." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Sources,
});

const SOURCES = [
  { id: "nisar", name: "NASA-ISRO NISAR", kind: "L-band SAR", cadence: "12-day repeat", res: "20 m", license: "NASA open data", status: "Connected", lag: 18 },
  { id: "dem", name: "Copernicus DEM GLO-30", kind: "Elevation / HAND", cadence: "Static", res: "30 m", license: "Copernicus licence", status: "Connected", lag: 2400 },
  { id: "meteo", name: "Open-Meteo GFS / ECMWF", kind: "NWP forecast", cadence: "6-hourly", res: "9–25 km", license: "CC BY 4.0", status: "Connected", lag: 3 },
  { id: "hdx", name: "UN OCHA HDX", kind: "Site & sector baselines", cadence: "Weekly", res: "Admin-3 / site", license: "Varies (mostly CC BY)", status: "Degraded", lag: 96 },
  { id: "dtm", name: "IOM DTM", kind: "Displacement tracking", cadence: "Monthly rounds", res: "Site / collective centre", license: "IOM terms", status: "Connected", lag: 320 },
  { id: "unhcr", name: "UNHCR Operational Data", kind: "Population & registration", cadence: "Monthly", res: "Country / site", license: "UNHCR terms", status: "Stale", lag: 720 },
];

const STATUS = { Connected: "bg-risk-low", Degraded: "bg-risk-warn", Stale: "bg-risk-crit" } as const;

function Sources() {
  const { t, locale } = useI18n();
  const { timezone, region } = useStore();
  const { analysis } = useNisarAnalysis(region);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [synced, setSynced] = useState<Record<string, string>>({});

  const sync = (id: string, name: string) => {
    setSyncing(id);
    setTimeout(() => {
      setSyncing(null);
      setSynced((s) => ({ ...s, [id]: new Date().toISOString() }));
      toast.success(t(`${name} re-synced (simulated)`));
    }, 1400);
  };

  return (
    <div className="p-5">
      <PageHeader title={t("Data sources & transparency")} sub={t("Connections below are simulated for this prototype, except NISAR: its map layers and radar change measurements are real data from NASA ASF. Simulated values are calibrated against public snapshots.")} right={<SimBadge />} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {SOURCES.map((s) => (
          <article key={s.id} className="flex flex-col rounded-md border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">{t(s.name)}</h3>
                <p className="text-xs text-muted-foreground">{t(s.kind)}</p>
              </div>
              <span className="flex items-center gap-1.5 text-xs">
                <span className={cn("size-2 rounded-full", synced[s.id] ? "bg-risk-low" : STATUS[s.status as keyof typeof STATUS])} />
                {s.id === "nisar" ? "Real data" : synced[s.id] ? "Connected" : s.status}
              </span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-y-2 text-xs">
              <dt className="text-muted-foreground">{t("Cadence")}</dt><dd className="num">{t(s.cadence)}</dd>
              <dt className="text-muted-foreground">{t("Resolution")}</dt><dd className="num">{t(s.res)}</dd>
              <dt className="text-muted-foreground">{t("License")}</dt><dd>{t(s.license)}</dd>
              <dt className="text-muted-foreground">{t("Last sync")}</dt>
              <dd className="num">{s.id === "nisar" ? (analysis ? fmtTime(analysis.generatedAt, timezone, true, locale) : "—") : synced[s.id] ? fmtTime(synced[s.id]!, timezone, true, locale) : fmtTime(new Date(REF_DATE.getTime() - s.lag * 3600e3).toISOString(), timezone, true, locale)}</dd>
            </dl>
            {s.id !== "nisar" && <Button variant="outline" size="sm" className="mt-4 self-start text-xs" disabled={syncing === s.id} onClick={() => sync(s.id, s.name)}>
              {syncing === s.id ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              {syncing === s.id ? "Syncing…" : "Refresh / Sync"}
            </Button>}
          </article>
        ))}
      </div>
      <p className="mt-6 max-w-3xl text-xs text-muted-foreground">
        {t("Data ethics: Camp Sentinel displays aggregated sector and cluster polygons only. It never renders pinpoint coordinates of individual shelters or households.")}
      </p>
    </div>
  );
}
