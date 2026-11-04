import { describe, expect, it } from "vitest";
import { fitCorners, maskNoData, parseScenes } from "@/lib/nisar";

/** Renders an axis-aligned block of data pixels into an otherwise black RGBA image. */
function image(w: number, h: number, x0: number, x1: number, y0: number, y1: number) {
  const px = new Uint8ClampedArray(w * h * 4).fill(0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      px[i + 3] = 255;
      if (x >= x0 && x <= x1 && y >= y0 && y <= y1) px[i] = 200;
    }
  }
  return px;
}

// 60°N: a pixel spanning 0.02° of longitude spans 0.01° of latitude.
const FOOTPRINT: [number, number][] = [
  [10, 60],
  [11.6, 60],
  [11.6, 59.2],
  [10, 59.2],
  [10, 60],
];

describe("fitCorners", () => {
  it("maps the data extent onto the footprint bounds", () => {
    const corners = fitCorners(image(100, 100, 10, 89, 10, 89), 100, 100, FOOTPRINT)!;
    expect(corners[0][0]).toBeCloseTo(9.8);
    expect(corners[0][1]).toBeCloseTo(60.1);
    expect(corners[2][0]).toBeCloseTo(11.8);
    expect(corners[2][1]).toBeCloseTo(59.1);
  });

  it("rejects a frame clipped by the image border", () => {
    expect(fitCorners(image(100, 100, 10, 89, 1, 80), 100, 100, FOOTPRINT)).toBeNull();
  });

  it("rejects a fit whose pixels aren't square on the ground", () => {
    expect(fitCorners(image(100, 100, 10, 89, 10, 69), 100, 100, FOOTPRINT)).toBeNull();
  });

  it("rejects an empty image", () => {
    expect(fitCorners(image(100, 100, 200, 200, 200, 200), 100, 100, FOOTPRINT)).toBeNull();
  });
});

describe("maskNoData", () => {
  it("hides only pure black pixels", () => {
    const px = new Uint8ClampedArray([0, 0, 0, 255, 1, 0, 0, 255]);
    maskNoData(px);
    expect(px[3]).toBe(0);
    expect(px[7]).toBe(255);
  });
});

describe("parseScenes", () => {
  const feature = (over: Record<string, unknown> = {}) => ({
    geometry: { type: "Polygon", coordinates: [FOOTPRINT] },
    properties: {
      fileID: "a",
      startTime: "2026-10-22T16:25:44Z",
      pathNumber: 151,
      flightDirection: "DESCENDING",
      frameCoverage: "Full",
      collectionName: "NISAR_L2_GCOV_PROVISIONAL_V1",
      browse: ["https://x/a_LATLON_thumbnail.png", "https://x/a_LATLON.png"],
      ...over,
    },
  });

  it("keeps full frames, newest first, with one entry per pass", () => {
    const scenes = parseScenes({
      features: [
        feature(),
        feature({ fileID: "reprocessed" }),
        feature({ fileID: "partial", frameCoverage: "Partial" }),
        feature({ fileID: "no-browse", browse: null }),
        feature({
          fileID: "older",
          startTime: "2026-10-10T16:25:44Z",
          collectionName: "NISAR_L2_GCOV_BETA_V1",
        }),
      ],
    });
    expect(scenes.map((s) => s.id)).toEqual(["a", "older"]);
    expect(scenes[0]).toMatchObject({
      quality: "PROVISIONAL",
      direction: "Descending",
      browseUrl: "https://x/a_LATLON.png",
    });
    expect(scenes[1]!.quality).toBe("BETA");
  });

  it("skips malformed scenes without failing the rest", () => {
    expect(parseScenes({ features: [{ geometry: null }, feature()] }).map((s) => s.id)).toEqual([
      "a",
    ]);
  });
});
