"""Compares two passes and summarizes each sector."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from pyproj import Transformer
from scipy.ndimage import uniform_filter

from .gcov import Window

# Radar speckle alone can move a pixel by a few dB; averaging over 3x3 pixels and requiring
# a 3 dB (factor of 2) change keeps the "changed" share focused on real surface change.
CHANGE_THRESHOLD_DB = 3.0
SMOOTHING_PIXELS = 3
# Weather and calibration shift a whole scene by up to about 1 dB between good passes. A larger
# shift means a faulty pass (Lviv track 100 on 2026-09-13 reads 5-8 dB too bright), not surface change.
MAX_SCENE_SHIFT_DB = 2.0
# A sector mostly outside the frame or masked out shouldn't report a value.
MIN_VALID_SHARE = 0.5


def to_db(power: np.ndarray) -> np.ndarray:
    with np.errstate(divide="ignore", invalid="ignore"):
        return 10 * np.log10(power)


def smooth_nan(values: np.ndarray, size: int = SMOOTHING_PIXELS) -> np.ndarray:
    """Box mean that ignores NaNs; pixels that were NaN stay NaN."""
    valid = np.isfinite(values)
    weights = uniform_filter(valid.astype(np.float32), size=size, mode="constant")
    totals = uniform_filter(np.where(valid, values, 0).astype(np.float32), size=size, mode="constant")
    with np.errstate(divide="ignore", invalid="ignore"):
        result = totals / weights
    result[~valid] = np.nan
    return result


def align(a: Window, b: Window) -> tuple[Window, Window] | None:
    """Crops two windows to their shared pixels; None if the grids differ or don't overlap."""
    if a.epsg != b.epsg:
        return None
    common_x, ax, bx = np.intersect1d(a.x, b.x, return_indices=True)
    common_y, ay, by = np.intersect1d(a.y, b.y, return_indices=True)
    if common_x.size == 0 or common_y.size == 0:
        return None

    def crop(w: Window, rows: np.ndarray, cols: np.ndarray) -> Window:
        rows, cols = np.sort(rows), np.sort(cols)  # ascending indices keep the original orientation
        order = np.ix_(rows, cols)
        return Window(w.epsg, w.x[cols], w.y[rows], w.hh[order], None if w.hv is None else w.hv[order])

    return crop(a, ay, ax), crop(b, by, bx)


def change_db(current: np.ndarray, previous: np.ndarray) -> np.ndarray:
    """Smoothed backscatter change in dB; positive means the surface got brighter."""
    return smooth_nan(to_db(current)) - smooth_nan(to_db(previous))


def remove_scene_shift(change: np.ndarray) -> tuple[np.ndarray, float] | None:
    """Keeps local change only; None if the shift is too large to trust the comparison."""
    shift = float(np.nanmedian(change))
    if not np.isfinite(shift) or abs(shift) > MAX_SCENE_SHIFT_DB:
        return None
    return change - shift, shift


def polygon_mask(window: Window, polygon: list[list[float]]) -> np.ndarray:
    """Even-odd rasterization of a lon/lat polygon onto the window's grid."""
    transform = Transformer.from_crs(4326, window.epsg, always_xy=True).transform
    px, py = transform([p[0] for p in polygon], [p[1] for p in polygon])
    grid_x, grid_y = np.meshgrid(window.x, window.y)
    inside = np.zeros(grid_x.shape, dtype=bool)
    for x1, y1, x2, y2 in zip(px, py, px[1:], py[1:]):
        if y1 == y2:
            continue
        crosses = (y1 > grid_y) != (y2 > grid_y)
        inside ^= crosses & (grid_x < (x2 - x1) * (grid_y - y1) / (y2 - y1) + x1)
    return inside


def _median_db(values: np.ndarray) -> float | None:
    return round(float(np.median(to_db(values))), 2) if values.size else None


def summarize_sector(
    window: Window, polygon: list[list[float]], change: np.ndarray | None, change_hv: np.ndarray | None
) -> dict | None:
    """Sector statistics, or None when too little of the sector has valid data."""
    inside = polygon_mask(window, polygon)
    if not inside.any():
        return None
    valid = inside & np.isfinite(window.hh)
    valid_share = valid.sum() / inside.sum()
    if valid_share < MIN_VALID_SHARE:
        return None
    result = {
        "validPct": round(float(valid_share) * 100, 1),
        "hhDb": _median_db(window.hh[valid]),
        "hvDb": None,
        "deltaHhDb": None,
        "deltaHvDb": None,
        "brighterPct": None,
        "darkerPct": None,
    }
    if window.hv is not None:
        result["hvDb"] = _median_db(window.hv[inside & np.isfinite(window.hv)])
    if change is not None:
        values = change[inside & np.isfinite(change)]
        if values.size >= MIN_VALID_SHARE * inside.sum():
            result["deltaHhDb"] = round(float(np.median(values)), 2)
            result["brighterPct"] = round(float(np.mean(values >= CHANGE_THRESHOLD_DB)) * 100, 1)
            result["darkerPct"] = round(float(np.mean(values <= -CHANGE_THRESHOLD_DB)) * 100, 1)
    if change_hv is not None:
        values = change_hv[inside & np.isfinite(change_hv)]
        if values.size >= MIN_VALID_SHARE * inside.sum():
            result["deltaHvDb"] = round(float(np.median(values)), 2)
    return result
