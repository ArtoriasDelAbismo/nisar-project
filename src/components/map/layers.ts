export const LAYER_KEYS = ["sectors", "sar", "drainage", "terrain", "facilities", "hazard", "nisar"] as const;
export type LayerKey = (typeof LAYER_KEYS)[number];
export interface LayerState {
  on: boolean;
  opacity: number;
}
export const LAYER_LABELS: Record<LayerKey, string> = {
  sectors: "Sector density & population",
  sar: "NISAR SAR change detection",
  drainage: "Drainage corridors (HAND < 2 m)",
  terrain: "Slope & elevation classes",
  facilities: "Critical service nodes",
  hazard: "Hazard severity heat",
  nisar: "NISAR radar imagery",
};

export const DEFAULT_ON: LayerKey[] = ["sectors", "facilities", "hazard"];

export function decodeLayers(on?: string, op?: string): Record<LayerKey, LayerState> {
  const active = on != null ? on.split(",").filter(Boolean) : DEFAULT_ON;
  const ops = (op ?? "").split(",").map(Number);
  return Object.fromEntries(
    LAYER_KEYS.map((k, i) => [k, { on: active.includes(k), opacity: Number.isFinite(ops[i]) && op ? ops[i] : 1 }]),
  ) as Record<LayerKey, LayerState>;
}

export function encodeLayers(l: Record<LayerKey, LayerState>) {
  return {
    layers: LAYER_KEYS.filter((k) => l[k].on).join(","),
    op: LAYER_KEYS.map((k) => Math.round(l[k].opacity * 100) / 100).join(","),
  };
}
