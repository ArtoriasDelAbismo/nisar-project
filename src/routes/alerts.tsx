import { useI18n } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useStore, fmtTime } from "@/lib/store";
import { PERIL_LABELS, REGIONS } from "@/data/generators/regions";
import type { AlertStatus, Severity } from "@/data/generators/alerts";
import { PageHeader, Panel, SeverityPill, SimBadge } from "@/components/ui-kit";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/alerts")({
  head: () => ({
    meta: [
      { title: "Alert Management — Camp Sentinel" },
      { name: "description", content: "Configure peril thresholds and manage the alert lifecycle from new to resolved." },
      { property: "og:title", content: "Camp Sentinel Alerts" },
      { property: "og:description", content: "Configure peril thresholds and manage the alert lifecycle." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Alerts,
});

const NEXT: Record<AlertStatus, AlertStatus | null> = { New: "Acknowledged", Acknowledged: "Assigned", Assigned: "Resolved", Resolved: null };
const ACTION: Record<AlertStatus, string> = { New: "Acknowledge", Acknowledged: "Assign", Assigned: "Resolve", Resolved: "" };
const TEAMS = ["WASH Cluster", "Shelter Cluster", "CCCM Team", "Health Cluster", "Protection"];

function Alerts() {
  const { t, locale } = useI18n();
  const { region, rules, set, alerts, setAlertStatus, timezone } = useStore();
  const [sev, setSev] = useState<Severity | "All">("All");
  const [status, setStatus] = useState<AlertStatus | "Open">("Open");
  const list = alerts.filter((a) => (sev === "All" || a.severity === sev) && (status === "Open" ? a.status !== "Resolved" : a.status === status));
  const regionRules = rules.filter((r) => r.region === region);

  const updateRule = (id: string, patch: Partial<(typeof rules)[0]>) => set("rules", rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <div className="p-5">
      <PageHeader title={t("Alert management")} sub={t(REGIONS[region].name)} right={<SimBadge />} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title={t("Rule engine")} bodyClass="space-y-3">
          {regionRules.map((r) => (
            <div key={r.id} className={cn("rounded-md border p-3", !r.enabled && "opacity-50")}>
              <div className="flex items-center justify-between">
                <span className="text-sm">{t(PERIL_LABELS[r.peril])}</span>
                <Switch checked={r.enabled} onCheckedChange={(v) => updateRule(r.id, { enabled: v })} />
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs num">
                <span className="text-muted-foreground">{r.metric === "index" ? "Index" : "Night temp °C"}</span>
                <span>{t(r.op)}</span>
                <Input type="number" value={r.threshold} onChange={(e) => updateRule(r.id, { threshold: Number(e.target.value) })} className="h-7 w-20 text-xs" />
              </div>
            </div>
          ))}
        </Panel>
        <Panel title={t(`Alert feed · ${list.length}`)} className="lg:col-span-2" bodyClass="p-0">
          <div className="flex flex-wrap gap-1 border-b px-3 py-2">
            {(["All", "Critical", "Warning", "Advisory"] as const).map((s) => (
              <Button key={s} size="sm" variant={sev === s ? "secondary" : "ghost"} className="h-7 text-xs" onClick={() => setSev(s)}>{t(s)}</Button>
            ))}
            <span className="mx-1 w-px bg-border" />
            {(["Open", "New", "Acknowledged", "Assigned", "Resolved"] as const).map((s) => (
              <Button key={s} size="sm" variant={status === s ? "secondary" : "ghost"} className="h-7 text-xs" onClick={() => setStatus(s)}>{t(s)}</Button>
            ))}
          </div>
          <ul className="max-h-[620px] divide-y overflow-y-auto">
            {list.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">{t("No alerts match these filters.")}</li>}
            {list.map((a, i) => (
              <li key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                <SeverityPill s={a.severity} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="rounded-sm bg-muted px-1 text-[10px] num">{t(a.sectorId)}</span>
                    <span className="truncate">{t(a.sectorName)}</span>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{t(a.message)}</div>
                </div>
                <div className="hidden text-end text-[10px] text-muted-foreground sm:block num">
                  <div>{t(fmtTime(a.issuedAt, timezone, true, locale))}</div>
                  <div className={cn(a.status === "Resolved" && "text-risk-low")}>{t(a.status)}{a.assignee ? ` · ${a.assignee}` : ""}</div>
                </div>
                {NEXT[a.status] && (
                  <Button size="sm" variant="outline" className="h-7 w-24 text-xs" onClick={() => setAlertStatus(a.id, { status: NEXT[a.status]!, assignee: a.status === "Acknowledged" ? TEAMS[i % TEAMS.length] : a.assignee })}>
                    {t(ACTION[a.status])}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
