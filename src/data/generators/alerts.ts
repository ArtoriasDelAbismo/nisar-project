import { subMinutes } from "date-fns";
import type { Weights } from "@/config/hazardModels";
import { scoreRegion } from "@/lib/scoring";
import { REF_DATE } from "./prng";
import { PERIL_LABELS, type PerilId, type RegionId } from "./regions";

export type Severity = "Critical" | "Warning" | "Advisory";
export type AlertStatus = "New" | "Acknowledged" | "Assigned" | "Resolved";

export interface Rule {
  id: string;
  region: RegionId;
  peril: PerilId;
  metric: "index" | "nightTemp";
  op: ">" | "<";
  threshold: number;
  enabled: boolean;
}

export const DEFAULT_RULES: Rule[] = [
  { id: "r1", region: "gaza", peril: "flood", metric: "index", op: ">", threshold: 70, enabled: true },
  { id: "r2", region: "gaza", peril: "wind", metric: "index", op: ">", threshold: 75, enabled: true },
  { id: "r3", region: "gaza", peril: "heat", metric: "index", op: ">", threshold: 60, enabled: true },
  { id: "r4", region: "lviv", peril: "frost", metric: "nightTemp", op: "<", threshold: -5, enabled: true },
  { id: "r5", region: "lviv", peril: "frost", metric: "index", op: ">", threshold: 65, enabled: true },
  { id: "r6", region: "lviv", peril: "wind", metric: "index", op: ">", threshold: 55, enabled: false },
];

export interface Alert {
  id: string;
  region: RegionId;
  peril: PerilId;
  sectorId: string;
  sectorName: string;
  severity: Severity;
  message: string;
  value: number;
  issuedAt: string;
}

export function evaluateAlerts(region: RegionId, rules: Rule[], weights: Weights): Alert[] {
  const out: Alert[] = [];
  rules
    .filter((r) => r.enabled && r.region === region)
    .forEach((rule) => {
      scoreRegion(region, rule.peril, weights).forEach((sc, i) => {
        const value = rule.metric === "index" ? sc.score : sc.localMin;
        const hit = rule.op === ">" ? value > rule.threshold : value < rule.threshold;
        if (!hit) return;
        const margin = Math.abs(value - rule.threshold);
        const severity: Severity =
          rule.metric === "index"
            ? margin > 12 ? "Critical" : margin > 5 ? "Warning" : "Advisory"
            : margin > 5 ? "Critical" : margin > 2 ? "Warning" : "Advisory";
        out.push({
          id: `${rule.id}-${sc.sector.id}`,
          region,
          peril: rule.peril,
          sectorId: sc.sector.id,
          sectorName: sc.sector.name,
          severity,
          value,
          message:
            rule.metric === "index"
              ? `${PERIL_LABELS[rule.peril]} index ${value} exceeds ${rule.threshold}`
              : `Night minimum ${value}°C below ${rule.threshold}°C`,
          issuedAt: subMinutes(REF_DATE, 7 + i * 13 + rule.id.charCodeAt(1) * 3).toISOString(),
        });
      });
    });
  const rank = { Critical: 0, Warning: 1, Advisory: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || b.issuedAt.localeCompare(a.issuedAt));
}
