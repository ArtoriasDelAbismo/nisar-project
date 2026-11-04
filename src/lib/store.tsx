import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { defaultWeightMap, type Weights } from "@/config/hazardModels";
import { DEFAULT_RULES, evaluateAlerts, type Alert, type AlertStatus, type Rule } from "@/data/generators/alerts";
import type { PerilId, RegionId } from "@/data/generators/regions";

export type Units = "metric" | "imperial";
export type Lang = "en" | "es" | "ar" | "uk";

export interface AlertState {
  status: AlertStatus;
  assignee?: string | undefined;
}

interface Settings {
  region: RegionId;
  weights: Weights;
  units: Units;
  timezone: string;
  lang: Lang;
  rules: Rule[];
  alertStates: Record<string, AlertState>;
}

const DEFAULTS: Settings = {
  region: "gaza",
  weights: defaultWeightMap(),
  units: "metric",
  timezone: "UTC",
  lang: "en",
  rules: DEFAULT_RULES,
  alertStates: {},
};

interface Ctx extends Settings {
  set: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
  setWeight: (p: PerilId, key: string, v: number) => void;
  setAlertStatus: (id: string, s: AlertState) => void;
  alerts: (Alert & AlertState)[];
  reset: () => void;
}

const StoreCtx = createContext<Ctx | null>(null);
const KEY = "camp-sentinel-settings-v1";

export function StoreProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setS({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) localStorage.setItem(KEY, JSON.stringify(s));
    document.documentElement.dir = s.lang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = s.lang;
  }, [s, loaded]);

  const alerts = useMemo(
    () =>
      evaluateAlerts(s.region, s.rules, s.weights).map((a) => ({
        ...a,
        ...(s.alertStates[a.id] ?? { status: "New" as AlertStatus }),
      })),
    [s.region, s.rules, s.weights, s.alertStates],
  );

  const value: Ctx = {
    ...s,
    alerts,
    set: (k, v) => setS((p) => ({ ...p, [k]: v })),
    setWeight: (p, key, v) =>
      setS((prev) => ({ ...prev, weights: { ...prev.weights, [p]: { ...prev.weights[p], [key]: v } } })),
    setAlertStatus: (id, st) => setS((p) => ({ ...p, alertStates: { ...p.alertStates, [id]: st } })),
    reset: () => setS((p) => ({ ...DEFAULTS, region: p.region })),
  };
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const c = useContext(StoreCtx);
  if (!c) throw new Error("StoreProvider missing");
  return c;
}

// ---- formatting helpers ----
export function fmtTemp(c: number, u: Units) {
  return u === "metric" ? `${c.toFixed(1)}°C` : `${(c * 1.8 + 32).toFixed(1)}°F`;
}
export function fmtRain(mm: number, u: Units) {
  return u === "metric" ? `${mm.toFixed(1)} mm` : `${(mm / 25.4).toFixed(2)} in`;
}
export function convTemp(c: number, u: Units) {
  return u === "metric" ? c : Math.round((c * 1.8 + 32) * 10) / 10;
}
export function convRain(mm: number, u: Units) {
  return u === "metric" ? mm : Math.round((mm / 25.4) * 100) / 100;
}
export function fmtTime(iso: string, tz: string, withDate = true, locale = "en-GB") {
  return new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    ...(withDate ? { day: "2-digit", month: "short" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}
export const fmtNum = (n: number, locale = "en-US") => new Intl.NumberFormat(locale).format(n);

export const T: Record<Lang, Record<string, string>> = {
  es: {
    overview: "Resumen", map: "Explorador de mapas", sites: "Sitios", demographics: "Demografía",
    hazards: "Riesgos y alertas", alerts: "Alertas", sources: "Fuentes de datos", settings: "Ajustes",
    disclaimer: "Prototipo de apoyo a decisiones humanitarias — NO es un sistema oficial de alerta temprana ni de emergencias.",
  },
  en: {
    overview: "Overview", map: "Map Explorer", sites: "Sites", demographics: "Demographics",
    hazards: "Hazards & EWS", alerts: "Alerts", sources: "Data Sources", settings: "Settings",
    disclaimer: "Decision-support prototype for humanitarian planners — NOT an official early-warning or emergency alert system.",
  },
  ar: {
    overview: "نظرة عامة", map: "مستكشف الخرائط", sites: "المواقع", demographics: "السكان",
    hazards: "المخاطر والإنذار", alerts: "التنبيهات", sources: "مصادر البيانات", settings: "الإعدادات",
    disclaimer: "نموذج أولي لدعم القرار للمخططين الإنسانيين — ليس نظام إنذار مبكر رسمي.",
  },
  uk: {
    overview: "Огляд", map: "Карта", sites: "Об'єкти", demographics: "Демографія",
    hazards: "Загрози та ранні попередження", alerts: "Сповіщення", sources: "Джерела даних", settings: "Налаштування",
    disclaimer: "Прототип підтримки рішень для гуманітарних планувальників — НЕ офіційна система раннього попередження.",
  },
};
