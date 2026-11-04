import { useI18n } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useRegion } from "@/lib/useRegion";
import { fmtNum } from "@/lib/store";
import { demographics, discrepancySeries, monthlyTimeline } from "@/data/generators/timeseries";
import { CHART, PageHeader, Panel, SimBadge } from "@/components/ui-kit";

export const Route = createFileRoute("/demographics")({
  head: () => ({
    meta: [
      { title: "Demographics & Displacement — Camp Sentinel" },
      { name: "description", content: "Displacement timeline, age and gender distribution, shelter typology and SAR vs registration discrepancy." },
      { property: "og:title", content: "Camp Sentinel Demographics" },
      { property: "og:description", content: "Displacement timeline, age and gender distribution, and SAR vs registration discrepancy." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Demographics,
});

function Demographics() {
  const { t, date, locale } = useI18n();
  const { region, meta, sectors } = useRegion();
  const timeline = useMemo(() => monthlyTimeline(region), [region]);
  const demo = useMemo(() => demographics(region), [region]);
  const disc = useMemo(() => discrepancySeries(region), [region]);
  const typology = meta.shelterTypes.map((t) => ({
    name: t,
    value: sectors.reduce((a, s) => a + (s.population * (s.shelterMix[t] ?? 0)) / 100, 0),
  }));
  const elderly = sectors.reduce((a, s) => a + s.elderlyShare * s.population, 0) / meta.totalDisplaced;
  const children = demo.slice(0, 3).reduce((a, d) => a + d.female - d.male, 0) / meta.totalDisplaced;
  const vuln = sectors.reduce((a, s) => a + s.materialVuln * s.population, 0) / meta.totalDisplaced;

  return (
    <div className="p-5">
      <PageHeader title={t("Demographics & displacement")} sub={t(meta.name)} right={<SimBadge />} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t("12-month displacement timeline")}>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={timeline} stackOffset="sign">
                <CartesianGrid stroke={CHART.grid} strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="month" tick={CHART.tick} tickFormatter={(d) => date(new Date(d), "MMM")} />
                <YAxis tick={CHART.tick} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip {...CHART.tooltip} labelFormatter={(d) => date(new Date(d), "MMM yyyy")} formatter={(v: number) => fmtNum(Math.abs(v), locale)} />
                <ReferenceLine y={0} stroke={CHART.axis} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="arrivals" name={t("Arrivals")} fill="var(--chart-1)" stackId="a" />
                <Bar dataKey="relocations" name={t("Relocations / departures")} fill="var(--chart-2)" stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title={t("Age & gender distribution")}>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={demo} layout="vertical" stackOffset="sign">
                <CartesianGrid stroke={CHART.grid} strokeDasharray="2 4" horizontal={false} />
                <XAxis type="number" tick={CHART.tick} tickFormatter={(v) => `${Math.abs(Math.round(v / 1000))}k`} />
                <YAxis type="category" dataKey="bracket" tick={CHART.tick} width={40} />
                <Tooltip {...CHART.tooltip} formatter={(v: number) => fmtNum(Math.abs(v), locale)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="male" name={t("Male")} fill="var(--chart-5)" stackId="g" />
                <Bar dataKey="female" name={t("Female")} fill="var(--chart-1)" stackId="g" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title={t("Shelter typology & vulnerability")}>
          <div className="flex items-center gap-6">
            <div className="h-48 w-48">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={typology} dataKey="value" innerRadius={45} outerRadius={75} stroke="var(--card)">
                    {typology.map((_, i) => <Cell key={i} fill={`var(--chart-${i + 1})`} />)}
                  </Pie>
                  <Tooltip {...CHART.tooltip} formatter={(v: number) => fmtNum(Math.round(v), locale)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-3 text-sm">
              {typology.map((type, i) => (
                <div key={type.name} className="flex justify-between"><span className="flex items-center gap-2"><span className="size-2.5 rounded-sm" style={{ background: `var(--chart-${i + 1})` }} />{t(type.name)}</span><span className="num">{Math.round((type.value / meta.totalDisplaced) * 100)}%</span></div>
              ))}
              <div className="grid grid-cols-3 gap-2 border-t pt-3">
                {[["Elderly 60+", elderly], ["Children <18", children], ["Material vuln.", vuln]].map(([k, v]) => (
                  <div key={k as string}><div className="text-[10px] uppercase text-muted-foreground">{t(k)}</div><div className="text-lg num">{t(((v as number) * 100).toFixed(0))}{t("%")}</div></div>
                ))}
              </div>
            </div>
          </div>
        </Panel>
        <Panel title={t("Discrepancy: SAR footprint vs registered headcount")}>
          <div className="h-56">
            <ResponsiveContainer>
              <ComposedChart data={disc}>
                <CartesianGrid stroke={CHART.grid} strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="date" tick={CHART.tick} tickFormatter={(d) => date(new Date(d), "dd MMM")} />
                <YAxis tick={CHART.tick} unit="%" />
                <Tooltip {...CHART.tooltip} labelFormatter={(d) => date(new Date(d), "dd MMM")} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="gap" name={t("Gap (unregistered proxy)")} fill="var(--chart-3)" opacity={0.6} />
                <Line dataKey="sarFootprint" name={t("SAR footprint growth")} stroke="var(--chart-5)" dot={false} strokeWidth={2} />
                <Line dataKey="registered" name={t("Registered headcount growth")} stroke="var(--chart-1)" dot={false} strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t("A widening gap may indicate unregistered arrivals or densification not yet captured by registration rounds.")}</p>
        </Panel>
      </div>
    </div>
  );
}
