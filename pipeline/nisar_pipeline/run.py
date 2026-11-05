"""Builds public/data/nisar/<region>/ from real NISAR passes.

    python -m nisar_pipeline.run --region gaza --passes 8
"""

from __future__ import annotations

import argparse
import json
import pickle
from datetime import datetime, timezone
from pathlib import Path

import earthaccess
import numpy as np

from .catalog import Pair, Scene, pair_passes, search
from .gcov import Window, read_window
from .measure import align, change_db, polygon_mask, remove_scene_shift, summarize_sector
from .render import corners, write_backscatter, write_change

ROOT = Path(__file__).resolve().parents[2]
AOI_DIR = ROOT / "pipeline" / "aoi"
CACHE_DIR = ROOT / "pipeline" / "cache"
OUT_DIR = ROOT / "public" / "data" / "nisar"
BLOCK_SIZE = 8 * 1024 * 1024
# Extra area around the sectors, so overlays show their surroundings. Lviv's sectors are already
# spread over a window about 60x larger than Gaza's.
CONTEXT_MARGIN_DEG = {"gaza": 0.06, "lviv": 0.0}
# Open water changes with the wind between passes, which reads as false change. Brightness can't
# separate it here (sand dunes are as dark as the sea), so this traces the Mediterranean coast,
# set about 400 m offshore so that no land pixel is lost.
SEA_POLYGONS = {
    "gaza": [
        [34.547, 31.683],
        [34.442, 31.530],
        [34.213, 31.325],
        [33.9, 31.325],
        [33.9, 31.683],
        [34.547, 31.683],
    ]
}


def load_aoi(region: str) -> tuple[list[dict], tuple[float, float, float, float]]:
    sectors = json.loads((AOI_DIR / f"{region}.json").read_text())["sectors"]
    lons = [p[0] for s in sectors for p in s["polygon"]]
    lats = [p[1] for s in sectors for p in s["polygon"]]
    margin = CONTEXT_MARGIN_DEG[region]
    return sectors, (min(lons) - margin, min(lats) - margin, max(lons) + margin, max(lats) + margin)


class Reader:
    """Streams windows over HTTPS using the Earthdata Login in ~/.netrc, caching results locally."""

    def __init__(self, region: str, bounds: tuple[float, float, float, float]):
        self.region, self.bounds = region, bounds
        self.fs = None

    def window(self, scene: Scene) -> Window | None:
        cache = CACHE_DIR / self.region / f"{scene.id}.pkl"
        if cache.exists():
            return pickle.loads(cache.read_bytes())
        if self.fs is None:
            earthaccess.login(strategy="netrc")
            self.fs = earthaccess.get_fsspec_https_session()
        with self.fs.open(scene.url, block_size=BLOCK_SIZE, cache_type="blockcache") as remote:
            window = read_window(remote, self.bounds)
        cache.parent.mkdir(parents=True, exist_ok=True)
        partial = cache.with_suffix(".tmp")  # an interrupted run must not leave a truncated cache
        partial.write_bytes(pickle.dumps(window))
        partial.replace(cache)
        return window


def image_entry(region: str, name: str, window: Window) -> dict:
    return {"url": f"/data/nisar/{region}/{name}", "corners": corners(window)}


def process_pair(pair: Pair, region: str, sectors: list[dict], reader: Reader, out: Path) -> dict | None:
    scene = pair.current
    window = reader.window(scene)
    if window is None or np.isfinite(window.hh).sum() == 0:
        print(f"  skipped (no valid data over the region): {scene.id}")
        return None

    measured, change, change_hv = window, None, None
    aligned = None
    if pair.previous is not None:
        previous = reader.window(pair.previous)
        aligned = align(window, previous) if previous is not None else None
    scene_shift = None
    if aligned is not None:
        measured, earlier = aligned
        sea = polygon_mask(measured, SEA_POLYGONS[region]) if region in SEA_POLYGONS else None

        def comparison(now: np.ndarray, before: np.ndarray):
            delta = change_db(now, before)
            if sea is not None:
                delta[sea] = np.nan
            return remove_scene_shift(delta)

        hh_result = comparison(measured.hh, earlier.hh)
        if hh_result is None:
            print(f"  not compared (scene-wide shift too large): {pair.previous.id}")
            measured, aligned = window, None
        else:
            change, scene_shift = hh_result
            if measured.hv is not None and earlier.hv is not None:
                hv_result = comparison(measured.hv, earlier.hv)
                change_hv = hv_result[0] if hv_result else None

    summaries = {s["id"]: summarize_sector(measured, s["polygon"], change, change_hv) for s in sectors}
    if not any(summaries.values()):
        print(f"  skipped (no sector measured): {scene.id}")
        return None

    stem = f"{scene.acquired:%Y%m%d}-t{scene.track}-f{scene.frame}"
    write_backscatter(window, out / f"{stem}-hh.png")
    images = {"backscatter": image_entry(region, f"{stem}-hh.png", window), "change": None}
    if change is not None:
        write_change(change, measured.y, out / f"{stem}-change.png")
        images["change"] = image_entry(region, f"{stem}-change.png", measured)

    return {
        "id": scene.id,
        "acquired": scene.acquired.isoformat().replace("+00:00", "Z"),
        "track": scene.track,
        "frame": scene.frame,
        "direction": "Ascending" if scene.direction == "A" else "Descending",
        "polarization": scene.polarization,
        "previousAcquired": (
            pair.previous.acquired.isoformat().replace("+00:00", "Z") if aligned is not None else None
        ),
        "baselineDays": pair.baseline_days if aligned is not None else None,
        "sceneShiftDb": None if scene_shift is None else round(scene_shift, 2),
        "images": images,
        "sectors": {k: v for k, v in summaries.items() if v is not None},
    }


def build(region: str, max_passes: int) -> Path:
    sectors, bounds = load_aoi(region)
    center = ((bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2)
    pairs = pair_passes(search(*center))
    comparable = [p for p in pairs if p.previous is not None][:max_passes]
    print(f"{region}: {len(pairs)} usable passes, processing {len(comparable)}")

    out = OUT_DIR / region
    out.mkdir(parents=True, exist_ok=True)
    reader = Reader(region, bounds)
    passes = []
    for index, pair in enumerate(comparable, 1):
        print(f"[{index}/{len(comparable)}] {pair.current.id}")
        entry = process_pair(pair, region, sectors, reader, out)
        if entry is not None:
            passes.append(entry)

    keep = {Path(i["url"]).name for p in passes for i in p["images"].values() if i}
    for stale in out.glob("*.png"):
        if stale.name not in keep:
            stale.unlink()
    target = out / "index.json"
    target.write_text(
        json.dumps(
            {
                "region": region,
                "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "passes": passes,
            },
            indent=1,
        )
        + "\n"
    )
    return target


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--region", choices=["gaza", "lviv"], required=True)
    parser.add_argument("--passes", type=int, default=8, help="comparable passes to process")
    args = parser.parse_args()
    print(f"Wrote {build(args.region, args.passes)}")


if __name__ == "__main__":
    main()
