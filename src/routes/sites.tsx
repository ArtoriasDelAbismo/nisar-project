import { useI18n } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { useRegion } from "@/lib/useRegion";
import { fmtNum } from "@/lib/store";
import { useNisarAnalysis } from "@/lib/useNisar";
import { changeEvents } from "@/lib/nisarAnalysis";
import { FACILITY_LABEL } from "@/data/generators/facilities";
import { downloadCsv, Kpi, PageHeader, Panel, RiskPill, SimBadge } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/sites")({
  head: () => ({
    meta: [
      { title: "Sites & Management — NISAR project" },
      { name: "description", content: "Sector breakdown, SAR structure monitoring changelog and facilities matrix." },
      { property: "og:title", content: "NISAR project Sites" },
      { property: "og:description", content: "Sector breakdown, SAR structure monitoring changelog and facilities matrix." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Sites,
});

const STATUS_CLASS = {
  Operational: "text-risk-low",
  Degraded: "text-risk-warn",
  Offline: "text-risk-crit",
};

function Sites() {
  const { t, date, locale } = useI18n();
  const { region, meta, scores, facilities, sectors } = useRegion();
  const { passes: nisarPasses, loading: nisarLoading } = useNisarAnalysis(region);
  const changelog = changeEvents(nisarPasses, sectors).slice(0, 14);

  const exportCsv = () =>
    downloadCsv(
      `nisar-project-${meta.id}-sectors.csv`,
      scores.map((s) => ({
        id: s.sector.id,
        name: s.sector.name,
        district: s.sector.district,
        population: s.sector.population,
        density_km2: s.sector.density,
        shelter_units: s.sector.shelterUnits,
        elevation_m: s.sector.elevation,
        hand_m: s.sector.hand,
        peril_index: s.score,
        simulated: true,
      })),
    );

  const op = facilities.filter((f) => f.status === "Operational").length;
  return (
    <div className="p-5">
      <PageHeader title={t("Site detail & management")} sub={t(meta.name)} right={<SimBadge />} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t("Sectors / clusters")} value={sectors.length} sub={t(`${meta.sites} ${meta.siteLabel}`)} />
        <Kpi label={t("Shelter units")} value={fmtNum(sectors.reduce((a, s) => a + s.shelterUnits, 0), locale)} sub={t(meta.shelterUnitLabel)} />
        <Kpi label={t("Facilities operational")} value={`${op}/${facilities.length}`} tone={op / facilities.length < 0.8 ? "text-risk-warn" : "text-risk-low"} />
        <Kpi label={t("Over-capacity facilities")} value={facilities.filter((f) => f.utilization > 1).length} tone="text-risk-crit" />
      </div>

      <Panel className="mt-4" title={t("Sector breakdown")} bodyClass="p-0 overflow-x-auto" right={<Button size="sm" variant="outline" className="h-7 text-xs" onClick={exportCsv}><Download className="size-3.5" />{t("CSV")}</Button>}>
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr className="border-b">
              {["ID", "Sector", "District", "Population", "Density/km²", "Shelters", "Elev m", "HAND m", "Index"].map((h) => (
                <th key={h} className="px-3 py-2 text-start font-medium">{t(h)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scores.map(({ sector: s, score }) => (
              <tr key={s.id} className="border-b last:border-0 hover:bg-muted/50">
                <td className="px-3 py-2 text-xs text-muted-foreground num">{t(s.id)}</td>
                <td className="px-3 py-2">{t(s.name)}</td>
                <td className="px-3 py-2 text-muted-foreground">{t(s.district)}</td>
                <td className="px-3 py-2 num">{t(fmtNum(s.population, locale))}</td>
                <td className="px-3 py-2 num">{t(fmtNum(s.density, locale))}</td>
                <td className="px-3 py-2 num">{t(fmtNum(s.shelterUnits, locale))}</td>
                <td className="px-3 py-2 num">{t(s.elevation)}</td>
                <td className={cn("px-3 py-2 num", s.hand < 2 && "text-risk-crit")}>{t(s.hand)}</td>
                <td className="px-3 py-2"><RiskPill score={score} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Panel title={t("NISAR radar change log")} className="lg:col-span-2" bodyClass="p-0">
          <ul className="divide-y text-sm">
            {changelog.map((c) => (
              <li key={c.date + c.sectorId} className="flex items-center gap-3 px-4 py-2">
                <span className="w-14 text-xs text-muted-foreground num">{t(date(new Date(c.date), "dd MMM"))}</span>
                <span className="flex-1 truncate">{t(c.sector)}</span>
                <span className="text-xs text-muted-foreground num">
                  ▲ {t(c.brighterPct)}{t("%")} ▼ {t(c.darkerPct)}{t("%")}
                </span>
              </li>
            ))}
          </ul>
          {changelog.length === 0 && <p className="px-4 py-3 text-xs text-muted-foreground">{t(nisarLoading ? "Loading NISAR measurements…" : "No sector exceeded the change threshold.")}</p>}
          <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">{t("Real NISAR measurements: share of each sector that got brighter (▲) or darker (▼) by 3 dB or more since the previous pass. This is a prompt for review, not confirmed structure change.")}</p>
        </Panel>
        <Panel title={t("Facilities matrix")} className="lg:col-span-3" bodyClass="p-0 max-h-[440px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr className="border-b">
                {["Facility", "Type", "Capacity", "Utilisation", "Status"].map((h) => <th key={h} className="px-3 py-2 text-start font-medium">{t(h)}</th>)}
              </tr>
            </thead>
            <tbody>
              {facilities.map((f) => (
                <tr key={f.id} className="border-b last:border-0">
                  <td className="px-3 py-1.5"><div className="truncate text-xs text-muted-foreground num">{t(f.id)}</div><div className="truncate">{t(f.name.split(" · ")[1])}</div></td>
                  <td className="px-3 py-1.5 text-xs">{t(FACILITY_LABEL[f.type])}</td>
                  <td className="px-3 py-1.5 num">{t(fmtNum(f.capacity, locale))}</td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-sm bg-muted">
                        <div className={cn("h-full", f.utilization > 1 ? "bg-risk-crit" : f.utilization > 0.85 ? "bg-risk-warn" : "bg-risk-low")} style={{ width: `${Math.min(100, f.utilization * 100)}%` }} />
                      </div>
                      <span className="text-xs num">{t(Math.round(f.utilization * 100))}{t("%")}</span>
                    </div>
                  </td>
                  <td className={cn("px-3 py-1.5 text-xs", STATUS_CLASS[f.status])}>{t(f.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
}
