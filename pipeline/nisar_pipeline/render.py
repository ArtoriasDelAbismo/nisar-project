"""Writes map overlays as PNGs with the geographic corners MapLibre needs."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image
from pyproj import Transformer

from .gcov import Window
from .measure import CHANGE_THRESHOLD_DB, to_db

MAX_SIDE_PX = 2048
BACKSCATTER_RANGE_DB = (-25.0, 5.0)
CHANGE_RANGE_DB = 8.0
# Colorblind-safe: orange for darker, blue for brighter.
DARKER_RGB = (230, 97, 1)
BRIGHTER_RGB = (33, 113, 181)


def corners(window: Window) -> list[list[float]]:
    """Lon/lat of the outer pixel edges: top-left, top-right, bottom-right, bottom-left."""
    half_x = abs(window.x[1] - window.x[0]) / 2
    half_y = abs(window.y[1] - window.y[0]) / 2
    left, right = window.x.min() - half_x, window.x.max() + half_x
    top, bottom = window.y.max() + half_y, window.y.min() - half_y
    transform = Transformer.from_crs(window.epsg, 4326, always_xy=True).transform
    return [[round(v, 6) for v in transform(x, y)] for x, y in ((left, top), (right, top), (right, bottom), (left, bottom))]


def _north_up(values: np.ndarray, y: np.ndarray) -> np.ndarray:
    return values if y[0] > y[-1] else values[::-1]


def _fit(image: Image.Image) -> Image.Image:
    image.thumbnail((MAX_SIDE_PX, MAX_SIDE_PX), Image.Resampling.BOX)
    return image


def write_backscatter(window: Window, path: Path) -> None:
    low, high = BACKSCATTER_RANGE_DB
    db = _north_up(to_db(window.hh), window.y)
    finite = np.isfinite(db)
    gray = np.clip((np.nan_to_num(db, nan=low) - low) / (high - low), 0, 1) * 255
    rgba = np.dstack([gray, gray, gray, finite * 255.0]).astype(np.uint8)
    _fit(Image.fromarray(rgba, "RGBA")).save(path, optimize=True)


def write_change(change: np.ndarray, y: np.ndarray, path: Path) -> None:
    """Pixels under half the change threshold are transparent, leaving meaningful change."""
    delta = _north_up(change, y)
    finite = np.isfinite(delta)
    values = np.nan_to_num(delta)
    rgba = np.zeros((*delta.shape, 4), dtype=np.uint8)
    rgba[values >= 0, :3] = BRIGHTER_RGB
    rgba[values < 0, :3] = DARKER_RGB
    strength = np.clip((np.abs(values) - CHANGE_THRESHOLD_DB / 2) / (CHANGE_RANGE_DB - CHANGE_THRESHOLD_DB / 2), 0, 1)
    rgba[..., 3] = (finite * strength * 255).astype(np.uint8)
    _fit(Image.fromarray(rgba, "RGBA")).save(path, optimize=True)
