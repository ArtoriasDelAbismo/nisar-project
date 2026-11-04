import { useI18n } from "@/lib/i18n";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { riskBand } from "@/config/hazardModels";
import type { Severity } from "@/data/generators/alerts";

export function SimBadge({ className }: { className?: string }) {
  const { t } = useI18n();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border border-risk-warn/50 bg-risk-warn/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-risk-warn num",
        className,
      )}
    >
      {t("SIMULATED / DEMO")}
    </span>
  );
}

export function Panel({
  title,
  right,
  children,
  className,
  bodyClass,
}: {
  title?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClass?: string;
}) {
  const { t } = useI18n();
  return (
    <section className={cn("rounded-md border bg-card", className)}>
      {title && (
        <header className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t(title)}</h2>
          {t(right)}
        </header>
      )}
      <div className={cn("p-4", bodyClass)}>{t(children)}</div>
    </section>
  );
}

export function Kpi({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string | undefined }) {
  const { t } = useI18n();
  return (
    <div className="rounded-md border bg-card px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{t(label)}</div>
      <div className={cn("mt-1 text-2xl font-semibold num", tone)}>{t(value)}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground num">{t(sub)}</div>}
    </div>
  );
}

const BAND_CLASS = {
  "risk-low": "bg-risk-low/15 text-risk-low border-risk-low/40",
  "risk-warn": "bg-risk-warn/15 text-risk-warn border-risk-warn/40",
  "risk-crit": "bg-risk-crit/15 text-risk-crit border-risk-crit/40",
  "risk-extreme": "bg-risk-extreme/20 text-risk-extreme border-risk-extreme/50",
} as const;

export function RiskPill({ score }: { score: number }) {
  const { t } = useI18n();
  const b = riskBand(score);
  return (
    <span className={cn("inline-flex min-w-16 justify-between gap-2 rounded-sm border px-1.5 py-0.5 text-[11px] num", BAND_CLASS[b.token])}>
      <span>{t(b.label)}</span>
      <span className="font-semibold">{t(score)}</span>
    </span>
  );
}

const SEV_CLASS: Record<Severity, string> = {
  Critical: BAND_CLASS["risk-crit"],
  Warning: BAND_CLASS["risk-warn"],
  Advisory: BAND_CLASS["risk-low"],
};
export function SeverityPill({ s }: { s: Severity }) {
  const { t } = useI18n();
  return <span className={cn("rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider", SEV_CLASS[s])}>{t(s)}</span>;
}

export function PageHeader({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t(title)}</h1>
        {sub && <p className="mt-1 text-sm text-muted-foreground">{t(sub)}</p>}
      </div>
      {t(right)}
    </div>
  );
}

export const CHART = {
  grid: "var(--border)",
  axis: "var(--muted-foreground)",
  tooltip: {
    contentStyle: { background: "var(--popover)", border: "1px solid var(--border)", fontSize: 11, fontFamily: "var(--font-mono)" },
    labelStyle: { color: "var(--muted-foreground)" },
  },
  tick: { fill: "var(--muted-foreground)", fontSize: 10, fontFamily: "var(--font-mono)" },
};

export function downloadCsv(name: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]!);
  const esc = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [keys.join(","), ...rows.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
