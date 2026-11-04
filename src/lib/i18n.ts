import { useStore } from "./store";
import { translateSpanish } from "./spanish";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export function useI18n() {
  const { lang } = useStore();
  function t<T>(value: T): T {
    return (lang === "es" && typeof value === "string" ? translateSpanish(value) : value) as T;
  }
  return { t,
    date: (value: Date, pattern: string) => format(value, pattern, lang === "es" ? { locale: es } : {}),
    locale: lang === "es" ? "es-AR" : "en-US" };
}
