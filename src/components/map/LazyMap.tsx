import { useI18n } from "@/lib/i18n";
import { lazy, Suspense, type ComponentProps } from "react";
import { ClientOnly } from "@tanstack/react-router";

const MapView = lazy(() => import("./MapView"));

function Fallback() {
  const { t } = useI18n();
  return (
    <div className="absolute inset-0 grid-bg flex items-center justify-center text-xs text-muted-foreground num">
      {t("initialising map…")}
    </div>
  );
}

export function LazyMap(props: ComponentProps<typeof MapView>) {
  return (
    <ClientOnly fallback={<Fallback />}>
      <Suspense fallback={<Fallback />}>
        <MapView {...props} />
      </Suspense>
    </ClientOnly>
  );
}
