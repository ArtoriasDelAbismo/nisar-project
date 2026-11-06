import type * as maplibregl from "maplibre-gl";
import type { Facility, FacilityType } from "@/data/generators/facilities";

const SIZE = 56;
const PIXEL_RATIO = 2;

/** Icon shapes from lucide, on its 24 x 24 grid. */
const PATHS: Record<FacilityType, string[]> = {
  medical: [
    "M4 9a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h4a1 1 0 0 1 1 1v4a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-4a1 1 0 0 1 1-1h4a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-4a1 1 0 0 1-1-1V4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4a1 1 0 0 1-1 1z",
  ],
  water: [
    "M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z",
  ],
  heating: [
    "M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4",
  ],
  food: [
    "M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2",
    "M7 2v20",
    "M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7",
  ],
  cooling: [
    "m10 20-1.25-2.5L6 18",
    "M10 4 8.75 6.5 6 6",
    "m14 20 1.25-2.5L18 18",
    "m14 4 1.25 2.5L18 6",
    "m17 21-3-6h-4",
    "m17 3-3 6 1.5 3",
    "M2 12h6.5L10 9",
    "m20 10-1.5 2 1.5 2",
    "M22 12h-6.5L14 15",
    "m4 10 1.5 2L4 14",
    "m7 21 3-6-1.5-3",
    "m7 3 3 6h4",
  ],
};

/** Status shows in the ring's pattern as well as its color, so it survives color blindness. */
const RING: Record<Facility["status"], { color: string; dash: number[] }> = {
  Operational: { color: "#34d399", dash: [] },
  Degraded: { color: "#fbbf24", dash: [9, 5] },
  Offline: { color: "#f87171", dash: [3, 5] },
};

export const FACILITY_STATUS_COLORS = Object.values(RING).map((r) => r.color);

export const facilityIconName = (type: string, status: string) => `facility-${type}-${status}`;

function drawIcon(type: FacilityType, status: Facility["status"]) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  const center = SIZE / 2;
  ctx.beginPath();
  ctx.arc(center, center, center - 4, 0, Math.PI * 2);
  ctx.fillStyle = "#0a0a0a";
  ctx.fill();
  ctx.strokeStyle = RING[status].color;
  ctx.lineWidth = 5;
  ctx.setLineDash(RING[status].dash);
  ctx.stroke();
  ctx.setLineDash([]);

  const scale = 1.3;
  const offset = center - 12 * scale;
  ctx.setTransform(scale, 0, 0, scale, offset, offset);
  ctx.strokeStyle = "#f5f5f5";
  ctx.lineWidth = 2;
  ctx.lineCap = ctx.lineJoin = "round";
  PATHS[type].forEach((d) => ctx.stroke(new Path2D(d)));
  return ctx.getImageData(0, 0, SIZE, SIZE);
}

/** Runs on every style load, because switching basemaps clears a map's images. */
export function addFacilityIcons(map: maplibregl.Map) {
  (Object.keys(PATHS) as FacilityType[]).forEach((type) => {
    (Object.keys(RING) as Facility["status"][]).forEach((status) => {
      const name = facilityIconName(type, status);
      if (!map.hasImage(name))
        map.addImage(name, drawIcon(type, status), { pixelRatio: PIXEL_RATIO });
    });
  });
}
