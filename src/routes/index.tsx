import { useI18n } from "@/lib/i18n";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Check } from "lucide-react";
import { useMemo } from "react";
import { useRegion } from "@/lib/useRegion";
import { fmtNum, fmtTime, useStore } from "@/lib/store";
import { displacementSeries, sarPasses } from "@/data/generators/timeseries";
import { CHART, Kpi, PageHeader, Panel, RiskPill, SeverityPill, SimBadge } from "@/components/ui-kit";
import { LazyMap } from "@/components/map/LazyMap";
import { decodeLayers } from "@/components/map/layers";
import { PERIL_LABELS } from "@/data/generators/regions";
import { REF_DATE } from "@/data/generators/prng";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Overview — Camp Sentinel" },
      { name: "description", content: "Displacement KPIs, active hazard alerts and high-risk sectors at a glance." },
      { property: "og:title", content: "Camp Sentinel Overview" },
      { property: "og:description", content: "Displacement KPIs, active hazard alerts and high-risk sectors at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Overview,
});

const MINI_LAYERS = decodeLayers("sectors,hazard");

function Overview() {
  const { t, date, locale } = useI18n();
  const { meta, scores, sectors, region, peril } = useRegion();
  const { alerts, setAlertStatus, timezone } = useStore();
  const series = useMemo(() => displacementSeries(region), [region]);
  const delta = series.reduce((a, d) => a + d.arrivals - d.relocations, 0);
  const shelters = sectors.reduce((a, s) => a + s.shelterUnits, 0);
  const active = alerts.filter((a) => a.status !== "Resolved");
  const top = active.filter((a) => a.severity !== "Advisory").slice(0, 5);
  const lastPass = sarPasses().at(-1)!;

  const freshness = [
    { k: "SAR pass", t: lastPass },
    { k: "Forecast run", t: new Date(REF_DATE.getTime() - 3 * 3600e3).toISOString() },
    { k: "DTM/SMC baseline", t: new Date(REF_DATE.getTime() - 4 * 86400e3).toISOString() },
  ];

  return (
    <div className="p-5">
      <PageHeader title={t(meta.name)} sub={t(`Baseline: ${meta.baseline} · primary peril: ${PERIL_LABELS[peril]}`)} right={<SimBadge />} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label={t("Displaced population")} value={fmtNum(meta.totalDisplaced, locale)} sub={t(`${meta.sites} ${meta.siteLabel}`)} />
        <Kpi label={t("30-day movement Δ")} value={`${delta >= 0 ? "+" : ""}${fmtNum(delta, locale)}`} tone={delta >= 0 ? "text-risk-warn" : "text-risk-low"} sub={t("arrivals − relocations")} />
        <Kpi label={t("Est. shelter units")} value={fmtNum(shelters, locale)} sub={t(meta.shelterUnitLabel)} />
        <Kpi label={t("Active hazard alerts")} value={active.length} tone={active.some((a) => a.severity === "Critical") ? "text-risk-crit" : undefined} sub={t(`${active.filter((a) => a.severity === "Critical").length} critical`)} />
        <div className="col-span-2 rounded-md border bg-card px-4 py-3 lg:col-span-1">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{t("Telemetry freshness")}</div>
          <ul className="mt-1.5 space-y-1 text-xs">
            {freshness.map((f) => (
              <li key={f.k} className="flex justify-between gap-2">
                <span className="text-muted-foreground">{t(f.k)}</span>
                <span className="num">{t(fmtTime(f.t, timezone, true, locale))}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Panel title={t("High-risk sectors")} className="flex min-w-0 flex-col lg:col-span-3" bodyClass="flex min-h-[380px] flex-1 flex-col p-0" right={<Link to="/map" className="text-xs text-primary">{t("Open map →")}</Link>}>
          <div className="relative min-h-[380px] flex-1 overflow-hidden rounded-b-md">
            <LazyMap region={region} scores={scores} layers={MINI_LAYERS} pass={11} />
          </div>
        </Panel>
        <div className="space-y-4 lg:col-span-2">
          <Panel title={t("Active alerts")} right={<Link to="/alerts" className="text-xs text-primary">{t("All →")}</Link>} bodyClass="p-0">
            <ul className="divide-y">
              {top.length === 0 && <li className="p-4 text-sm text-muted-foreground">{t("No critical or warning alerts.")}</li>}
              {top.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                  <SeverityPill s={a.severity} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{t(a.sectorName)}</div>
                    <div className="truncate text-xs text-muted-foreground">{t(a.message)}</div>
                  </div>
                  {a.status === "New" ? (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAlertStatus(a.id, { status: "Acknowledged" })}>
                      {t("Acknowledge")}
                    </Button>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-risk-low"><Check className="size-3" />{t(a.status)}</span>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title={t("30-day net influx")}>
            <div className="h-28">
              <ResponsiveContainer>
                <AreaChart data={series}>
                  <defs>
                    <linearGradient id="inf" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" hide />
                  <YAxis hide domain={["dataMin", "dataMax"]} />
                  <Tooltip {...CHART.tooltip} labelFormatter={(d) => date(new Date(d), "dd MMM")} formatter={(v: number) => fmtNum(v, locale)} />
                  <Area dataKey="total" stroke="var(--primary)" fill="url(#inf)" strokeWidth={1.5} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <Panel title={t("Top risk ranking")} bodyClass="p-0">
            <ul className="divide-y text-sm">
              {scores.slice(0, 4).map((s) => (
                <li key={s.sector.id} className="flex items-center justify-between px-4 py-2">
                  <span><span className="me-2 text-xs text-muted-foreground num">{t(s.sector.id)}</span>{t(s.sector.name)}</span>
                  <RiskPill score={s.score} />
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
