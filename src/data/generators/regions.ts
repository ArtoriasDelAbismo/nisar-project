export type RegionId = "gaza" | "lviv";
export type PerilId = "flood" | "frost" | "heat" | "wind";

export interface RegionMeta {
  id: RegionId;
  name: string;
  short: string;
  center: [number, number]; // [lon, lat]
  zoom: number;
  totalDisplaced: number;
  sites: number;
  siteLabel: string;
  shelterUnitLabel: string;
  shelterTypes: string[];
  primaryPeril: PerilId;
  baseline: string;
  baseElevation: number;
}

export const REGIONS: Record<RegionId, RegionMeta> = {
  gaza: {
    id: "gaza",
    name: "Gaza Strip — Al-Mawasi & Central Coastal Belt",
    short: "Gaza Coastal Belt",
    center: [34.3, 31.38],
    zoom: 11.2,
    totalDisplaced: 1_200_000,
    sites: 912,
    siteLabel: "makeshift sites",
    shelterUnitLabel: "makeshift tents",
    shelterTypes: ["Makeshift tent", "Transitional", "Concrete"],
    primaryPeril: "flood",
    baseline: "UN OCHA SMC / UNRWA situation snapshot",
    baseElevation: 8,
  },
  lviv: {
    id: "lviv",
    name: "Ukraine — Lviv Macro-Region IDP Collective Sites",
    short: "Lviv IDP Network",
    center: [23.9, 49.75],
    zoom: 7.6,
    totalDisplaced: 23_000,
    sites: 190,
    siteLabel: "collective centres",
    shelterUnitLabel: "modular units & dorm rooms",
    shelterTypes: ["Modular container", "Dormitory", "Public facility"],
    primaryPeril: "frost",
    baseline: "IOM DTM Collective Centre Assessment (CCCM)",
    baseElevation: 290,
  },
};

export const PERIL_LABELS: Record<PerilId, string> = {
  flood: "Coastal & Rain Flooding",
  frost: "Winter Frost / Hypothermia",
  heat: "Extreme Heat",
  wind: "Wind / Storm Surge",
};
