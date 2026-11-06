import { useI18n } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useRegion } from "@/lib/useRegion";
import { convRain, convTemp, fmtTemp, useStore } from "@/lib/store";
import { PERIL_LABELS, type PerilId } from "@/data/generators/regions";
import { lapseAdjust } from "@/data/generators/forecast";
import { RECOMMENDED_ACTIONS } from "@/lib/scoring";
import { CHART, PageHeader, Panel, RiskPill, SimBadge } from "@/components/ui-kit";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/hazards")({
  head: () => ({
    meta: [
      { title: "Hazards & Early Warning — NISAR project" },
      { name: "description", content: "Peril forecasts, transparent scoring formulas, sector risk ranking and recommended actions." },
      { property: "og:title", content: "NISAR project Hazard Engine" },
      { property: "og:description", content: "Peril forecasts, transparent scoring formulas and sector risk ranking." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Hazards,
});

function Hazards() {
  const { t, date, locale } = useI18n();
  const { region } = useStore();
  const [tab, setTab] = useState<PerilId | null>(null);
  const peril = tab ?? (region === "gaza" ? "flood" : "frost");
  const { scores, forecast, meta, sectors } = useRegion(peril);
  const { units } = useStore();
  const [sel, setSel] = useState<string | null>(null);
  const focus = (scores.find((s) => s.sector.id === sel) ?? scores[0])!;
  const tU = units === "metric" ? "°C" : "°F";

  const rain = forecast.daily.map((d) => ({ date: d.date, rain: convRain(d.rainMm, units), gust: d.gustKmh, max: convTemp(d.maxTemp, units) }));
  let cum = 0;
  const rainCum = rain.map((d) => ({ ...d, cum: Math.round((cum += d.rain) * 100) / 100 }));
  const hi = sectors.reduce((a, s) => (s.elevation > a.elevation ? s : a));
  const lo = sectors.reduce((a, s) => (s.elevation < a.elevation ? s : a));
  const nights = forecast.hourly
    .filter((_, i) => i % 3 === 0)
    .map((h) => ({
      time: h.time,
      station: convTemp(h.temp, units),
      high: convTemp(lapseAdjust(h.temp, hi.elevation, meta.baseElevation), units),
      low: convTemp(lapseAdjust(h.temp, lo.elevation, meta.baseElevation), units),
    }));

  return (
    <div className="p-5">
      <PageHeader title={t("Hazards & early-warning engine")} sub={t(meta.name)} right={<SimBadge />} />
      <Tabs value={peril} onValueChange={(v) => setTab(v as PerilId)}>
        <TabsList>
          {(Object.keys(PERIL_LABELS) as PerilId[]).map((p) => <TabsTrigger key={p} value={p} className="text-xs">{t(PERIL_LABELS[p])}</TabsTrigger>)}
        </TabsList>
      </Tabs>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {(peril === "flood" || peril === "wind") && (
          <Panel title={peril === "flood" ? "7-day rainfall accumulation" : "7-day peak gust (km/h)"}>
            <div className="h-60">
              <ResponsiveContainer>
                {peril === "flood" ? (
                  <AreaChart data={rainCum}>
                    <CartesianGrid stroke={CHART.grid} strokeDasharray="2 4" vertical={false} />
                    <XAxis dataKey="date" tick={CHART.tick} tickFormatter={(d) => date(new Date(d), "EEE dd")} />
                    <YAxis tick={CHART.tick} unit={units === "metric" ? "mm" : "in"} />
                    <Tooltip {...CHART.tooltip} labelFormatter={(d) => date(new Date(d), "EEE dd MMM")} />
                    <Area dataKey="cum" name={t("Cumulative")} stroke="var(--chart-5)" fill="var(--chart-5)" fillOpacity={0.15} />
                    <Area dataKey="rain" name={t("Daily")} stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.4} />
                  </AreaChart>
                ) : (
                  <BarChart data={rain}>
                    <CartesianGrid stroke={CHART.grid} strokeDasharray="2 4" vertical={false} />
                    <XAxis dataKey="date" tick={CHART.tick} tickFormatter={(d) => date(new Date(d), "EEE dd")} />
                    <YAxis tick={CHART.tick} />
                    <Tooltip {...CHART.tooltip} labelFormatter={(d) => date(new Date(d), "EEE dd MMM")} />
                    <Bar dataKey="gust" name={t("Gust km/h")} fill="var(--chart-2)" />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </Panel>
        )}
        {(peril === "frost" || peril === "heat") && (
          <Panel title={peril === "frost" ? "Hourly temperature with elevation lapse adjustment" : "7-day daytime maximum"}>
            <div className="h-60">
              <ResponsiveContainer>
                {peril === "frost" ? (
                  <LineChart data={nights}>
                    <CartesianGrid stroke={CHART.grid} strokeDasharray="2 4" vertical={false} />
                    <XAxis dataKey="time" tick={CHART.tick} tickFormatter={(d) => date(new Date(d), "EEE HH")} minTickGap={30} />
                    <YAxis tick={CHART.tick} unit={tU} />
                    <Tooltip {...CHART.tooltip} labelFormatter={(d) => date(new Date(d), "EEE dd HH:mm")} />
                    <ReferenceLine y={convTemp(-5, units)} stroke="var(--risk-crit)" strokeDasharray="4 3" />
                    <Line dataKey="station" name={t(`Station ${meta.baseElevation} m`)} stroke="var(--muted-foreground)" dot={false} />
                    <Line dataKey="high" name={t(`${hi.name} ${hi.elevation} m`)} stroke="var(--chart-4)" dot={false} strokeWidth={1.5} />
                    <Line dataKey="low" name={t(`${lo.name} ${lo.elevation} m`)} stroke="var(--chart-1)" dot={false} strokeWidth={1.5} />
                  </LineChart>
                ) : (
                  <BarChart data={rain}>
                    <CartesianGrid stroke={CHART.grid} strokeDasharray="2 4" vertical={false} />
                    <XAxis dataKey="date" tick={CHART.tick} tickFormatter={(d) => date(new Date(d), "EEE dd")} />
                    <YAxis tick={CHART.tick} unit={tU} />
                    <Tooltip {...CHART.tooltip} />
                    <Bar dataKey="max" name={t("Max temp")} fill="var(--chart-3)" />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
            {peril === "frost" && <p className="mt-2 text-xs text-muted-foreground">{t("Lapse rate −6.5 °C/km applied from reference station. Dashed line: −5 °C threshold. Forecast minimum")} {t(fmtTemp(forecast.minNight, units))}{t(".")}</p>}
          </Panel>
        )}

        <Panel title={t("Why this score?")} right={<span className="text-xs text-muted-foreground">{t(focus.sector.name)}</span>}>
          <div className="mb-3 flex items-center justify-between">
            <code className="text-[11px] text-muted-foreground num">{t("score = Σ wᵢ · xᵢ × 100")}</code>
            <RiskPill score={focus.score} />
          </div>
          <ul className="space-y-2.5">
            {focus.contributions.map((c) => (
              <li key={c.key}>
                <div className="flex justify-between text-xs">
                  <span>{t(c.label)} <span className="text-muted-foreground num">{t("w=")}{t(Math.round(c.weight * 100))}{t("%")}</span></span>
                  <span className="num">{t("x=")}{t(c.value.toFixed(2))} {t("→")} <b>{t(c.points)}</b> {t("pts")}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-sm bg-muted">
                  <div className="h-full bg-primary" style={{ width: `${c.points}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">{t("Adjust weights in Settings → Model weights. Click a sector below to inspect its breakdown.")}</p>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Panel title={t("Sector risk ranking")} className="lg:col-span-3" bodyClass="p-0">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr className="border-b">{["#", "Sector", "Population", region === "lviv" ? "Local min" : "HAND m", "Index"].map((h) => <th key={h} className="px-3 py-2 text-start font-medium">{t(h)}</th>)}</tr>
            </thead>
            <tbody>
              {scores.map((s, i) => (
                <tr key={s.sector.id} onClick={() => setSel(s.sector.id)} className={cn("cursor-pointer border-b last:border-0 hover:bg-muted/50", focus.sector.id === s.sector.id && "bg-accent")}>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground num">{i + 1}</td>
                  <td className="px-3 py-1.5">{t(s.sector.name)}</td>
                  <td className="px-3 py-1.5 num">{t(s.sector.population.toLocaleString(locale))}</td>
                  <td className="px-3 py-1.5 num">{region === "lviv" ? fmtTemp(s.localMin, units) : s.sector.hand}</td>
                  <td className="px-3 py-1.5"><RiskPill score={s.score} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title={t("Recommended humanitarian actions")} className="lg:col-span-2">
          <ol className="space-y-2 text-sm">
            {RECOMMENDED_ACTIONS[peril].map((a, i) => (
              <li key={a} className="flex gap-2"><span className="text-primary num">{t(String(i + 1).padStart(2, "0"))}</span><span>{t(a)}</span></li>
            ))}
          </ol>
          <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">{t("Priority sectors:")} {t(scores.slice(0, 3).map((s) => s.sector.name).join(", "))}{t(".")}</p>
        </Panel>
      </div>
    </div>
  );
}
