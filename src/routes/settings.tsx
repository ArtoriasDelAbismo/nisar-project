import { useI18n } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { DEFAULT_WEIGHTS } from "@/config/hazardModels";
import { PERIL_LABELS, type PerilId } from "@/data/generators/regions";
import { useStore, type Lang } from "@/lib/store";
import { useRegion } from "@/lib/useRegion";
import { PageHeader, Panel, RiskPill } from "@/components/ui-kit";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings & Model Weights — Camp Sentinel" },
      { name: "description", content: "Calibrate hazard model weights live and set units, timezone and language." },
      { property: "og:title", content: "Camp Sentinel Settings" },
      { property: "og:description", content: "Calibrate hazard model weights live and set units, timezone and language." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Settings,
});

const TZ = ["UTC", "Asia/Gaza", "Europe/Kyiv", "Europe/Geneva", "America/New_York"];

function Settings() {
  const { t } = useI18n();
  const { weights, setWeight, units, timezone, lang, set, reset } = useStore();
  const { scores, peril } = useRegion();

  return (
    <div className="p-5">
      <PageHeader title={t("Settings & model weights")} right={<Button variant="outline" size="sm" onClick={reset}>{t("Reset to defaults")}</Button>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="grid gap-4 md:grid-cols-2 lg:col-span-2">
          {(Object.keys(DEFAULT_WEIGHTS) as PerilId[]).map((p) => {
            const total = DEFAULT_WEIGHTS[p].reduce((a, f) => a + (weights[p]?.[f.key] ?? 0), 0) || 1;
            return (
              <Panel key={p} title={t(PERIL_LABELS[p])}>
                <ul className="space-y-4">
                  {DEFAULT_WEIGHTS[p].map((f) => (
                    <li key={f.key}>
                      <div className="mb-1.5 flex justify-between text-xs">
                        <span>{t(f.label)}</span>
                        <span className="num text-muted-foreground">{t(Math.round(((weights[p]?.[f.key] ?? 0) / total) * 100))}{t("%")}</span>
                      </div>
                      <Slider value={[(weights[p]?.[f.key] ?? 0) * 100]} min={0} max={100} step={1} onValueChange={([v]) => setWeight(p, f.key, (v ?? 0) / 100)} />
                    </li>
                  ))}
                </ul>
              </Panel>
            );
          })}
        </div>
        <div className="space-y-4">
          <Panel title={t(`Live scores · ${PERIL_LABELS[peril]}`)} bodyClass="p-0">
            <ul className="divide-y text-sm">
              {scores.slice(0, 8).map((s) => (
                <li key={s.sector.id} className="flex items-center justify-between px-4 py-1.5">
                  <span className="truncate">{t(s.sector.name)}</span>
                  <RiskPill score={s.score} />
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title={t("Preferences")} bodyClass="space-y-4">
            <div>
              <div className="mb-1.5 text-xs text-muted-foreground">{t("Units")}</div>
              <div className="flex gap-1">
                <Button size="sm" variant={units === "metric" ? "secondary" : "ghost"} onClick={() => set("units", "metric")}>{t("°C / mm")}</Button>
                <Button size="sm" variant={units === "imperial" ? "secondary" : "ghost"} onClick={() => set("units", "imperial")}>{t("°F / in")}</Button>
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-xs text-muted-foreground">{t("Timezone")}</div>
              <Select value={timezone} onValueChange={(v) => set("timezone", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TZ.map((zone) => <SelectItem key={zone} value={zone}>{zone}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <div className="mb-1.5 text-xs text-muted-foreground">{t("Language")}</div>
              <div className="flex gap-1">
                {([["en", "EN"], ["es", "ES"], ["ar", "AR"], ["uk", "UK"]] as [Lang, string][]).map(([k, l]) => (
                  <Button key={k} size="sm" variant={lang === k ? "secondary" : "ghost"} onClick={() => set("lang", k)}>{t(l)}</Button>
                ))}
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
