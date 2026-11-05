"""Reads an area of interest from a GCOV product (layout: JPL D-102274 Rev F).

Products are chunked and paged for cloud access, so a remote read fetches only the chunks
covering the window rather than the whole ~1.8 GB file.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import BinaryIO

import h5py
import numpy as np
from pyproj import Transformer

GRID = "/science/LSAR/GCOV/grids/frequencyA"
BOUNDS_MARGIN_M = 200
MASK_FILL = 255


@dataclass
class Window:
    """Gamma-0 backscatter on a north-up UTM grid; invalid pixels are NaN."""

    epsg: int
    x: np.ndarray
    y: np.ndarray
    hh: np.ndarray
    hv: np.ndarray | None


def lonlat_bounds_to_utm(bounds: tuple[float, float, float, float], epsg: int):
    west, south, east, north = bounds
    transform = Transformer.from_crs(4326, epsg, always_xy=True).transform
    xs, ys = transform([west, east, east, west], [south, south, north, north])
    return (
        min(xs) - BOUNDS_MARGIN_M,
        min(ys) - BOUNDS_MARGIN_M,
        max(xs) + BOUNDS_MARGIN_M,
        max(ys) + BOUNDS_MARGIN_M,
    )


def valid_pixels(mask: np.ndarray) -> np.ndarray:
    """Codes 1-5 are fully focused sub-swaths; 0 is invalid and 255 is fill."""
    return (mask >= 1) & (mask <= 5)


def _slice_for(axis: np.ndarray, low: float, high: float) -> slice | None:
    inside = np.flatnonzero((axis >= low) & (axis <= high))
    return slice(int(inside[0]), int(inside[-1]) + 1) if inside.size else None


def read_window(source: str | BinaryIO, bounds: tuple[float, float, float, float]) -> Window | None:
    """Returns the pixels inside lon/lat bounds, or None if the product doesn't cover them."""
    with h5py.File(source, "r") as f:
        grid = f[GRID]
        epsg = int(grid["projection"][()])
        x = grid["xCoordinates"][()]
        y = grid["yCoordinates"][()]
        x_min, y_min, x_max, y_max = lonlat_bounds_to_utm(bounds, epsg)
        cols = _slice_for(x, x_min, x_max)
        rows = _slice_for(y, y_min, y_max)
        if cols is None or rows is None:
            return None
        valid = valid_pixels(grid["mask"][rows, cols])

        def band(name: str) -> np.ndarray:
            data = grid[name][rows, cols].astype(np.float32)
            data[~valid | ~np.isfinite(data) | (data <= 0)] = np.nan
            return data

        return Window(
            epsg=epsg,
            x=x[cols],
            y=y[rows],
            hh=band("HHHH"),
            hv=band("HVHV") if "HVHV" in grid else None,
        )
