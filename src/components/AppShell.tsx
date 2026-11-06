import { useI18n } from "@/lib/i18n";
import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  Bell,
  Database,
  LayoutDashboard,
  Map,
  Satellite,
  Settings,
  Tent,
  Users,
} from "lucide-react";
import { useStore, T } from "@/lib/store";
import { REGIONS, type RegionId } from "@/data/generators/regions";
import { SimBadge } from "./ui-kit";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", key: "overview", icon: LayoutDashboard },
  { to: "/map", key: "map", icon: Map },
  { to: "/sites", key: "sites", icon: Tent },
  { to: "/demographics", key: "demographics", icon: Users },
  { to: "/hazards", key: "hazards", icon: AlertTriangle },
  { to: "/alerts", key: "alerts", icon: Bell },
  { to: "/sources", key: "sources", icon: Database },
  { to: "/settings", key: "settings", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { lang, region, set, alerts } = useStore();
  const navText = T[lang];
  const path = useRouterState({ select: (s) => s.location.pathname });
  const open = alerts.filter((a) => a.status !== "Resolved").length;

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex items-center gap-2 border-b border-risk-warn/30 bg-risk-warn/10 px-4 py-1.5 text-[11px] text-risk-warn">
        <AlertTriangle className="size-3.5 shrink-0" />
        <span>{navText["disclaimer"]}</span>
      </div>
      <header className="flex h-12 items-center gap-4 border-b bg-sidebar px-4">
        <Link to="/" className="flex items-center gap-2">
          <Satellite className="size-5 text-primary" />
          <span className="text-sm font-semibold tracking-wide">{t("NISAR PROJECT")}</span>
        </Link>
        <SimBadge />
        <div className="ms-auto flex items-center gap-1 rounded-md border p-0.5">
          {(Object.keys(REGIONS) as RegionId[]).map((r) => (
            <button
              key={r}
              onClick={() => set("region", r)}
              className={cn(
                "rounded-sm px-3 py-1 text-xs transition-colors",
                region === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(REGIONS[r].short)}
            </button>
          ))}
        </div>
      </header>
      <div className="flex flex-1">
        <nav className="hidden w-52 shrink-0 border-e bg-sidebar p-2 md:block">
          {NAV.map((n) => {
            const active = n.to === "/" ? path === "/" : path.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "mb-0.5 flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                  active ? "bg-sidebar-accent text-foreground" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                )}
              >
                <n.icon className={cn("size-4", active && "text-primary")} />
                <span className="flex-1">{navText[n.key]}</span>
                {n.key === "alerts" && open > 0 && (
                  <span className="rounded-sm bg-risk-crit/20 px-1.5 text-[10px] text-risk-crit num">{t(open)}</span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="flex min-w-0 flex-1 flex-col">
          <nav className="flex gap-1 overflow-x-auto border-b px-2 py-1.5 md:hidden">
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} className="whitespace-nowrap rounded px-2 py-1 text-xs text-muted-foreground" activeProps={{ className: "bg-accent text-foreground" }} activeOptions={{ exact: n.to === "/" }}>
                {navText[n.key]}
              </Link>
            ))}
          </nav>
          <main className="min-w-0 flex-1">{t(children)}</main>
        </div>
      </div>
    </div>
  );
}
