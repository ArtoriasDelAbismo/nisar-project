from datetime import datetime, timedelta, timezone

import h5py
import numpy as np
import pytest
from PIL import Image

from nisar_pipeline.catalog import Scene, pair_passes, parse_scene
from nisar_pipeline.gcov import GRID, Window, read_window, valid_pixels
from nisar_pipeline.measure import align, change_db, polygon_mask, remove_scene_shift, smooth_nan, summarize_sector
from nisar_pipeline.render import corners, write_change

EPSG = 32636
LON, LAT = 34.3, 31.4


def utm_grid(n=120, spacing=20.0):
    """A north-up grid around (LON, LAT), like a GCOV frequencyA grid."""
    from pyproj import Transformer

    cx, cy = Transformer.from_crs(4326, EPSG, always_xy=True).transform(LON, LAT)
    cx, cy = round(cx / spacing) * spacing, round(cy / spacing) * spacing
    x = cx + (np.arange(n) - n // 2) * spacing
    y = cy - (np.arange(n) - n // 2) * spacing
    return x, y


def write_gcov(path, hh, mask=None, hv=True):
    x, y = utm_grid(hh.shape[0])
    with h5py.File(path, "w") as f:
        g = f.create_group(GRID)
        g["projection"] = np.uint32(EPSG)
        g["xCoordinates"] = x
        g["yCoordinates"] = y
        g.create_dataset("HHHH", data=hh.astype(np.float32), chunks=(64, 64), compression="gzip")
        if hv:
            g["HVHV"] = (hh / 10).astype(np.float32)
        g["mask"] = (np.full(hh.shape, 3, np.uint8) if mask is None else mask).astype(np.uint8)
    return path


BOUNDS = (LON - 0.02, LAT - 0.02, LON + 0.02, LAT + 0.02)


def square(window, margin=0.1):
    """A lon/lat polygon covering the middle of the window."""
    from pyproj import Transformer

    t = Transformer.from_crs(EPSG, 4326, always_xy=True).transform
    n = window.x.size
    a, b = int(n * margin), int(n * (1 - margin)) - 1
    pts = [(window.x[a], window.y[a]), (window.x[b], window.y[a]), (window.x[b], window.y[b]), (window.x[a], window.y[b])]
    pts.append(pts[0])
    return [list(t(*p)) for p in pts]


def test_mask_codes_follow_spec():
    assert valid_pixels(np.array([0, 1, 5, 6, 255])).tolist() == [False, True, True, False, False]


def test_read_window_masks_invalid_pixels(tmp_path):
    hh = np.full((120, 120), 0.1)
    hh[0, 0] = -1  # non-physical power
    mask = np.full((120, 120), 2)
    mask[60, 60] = 0
    mask[61, 61] = 255
    w = read_window(write_gcov(tmp_path / "a.h5", hh, mask), BOUNDS)
    assert w.epsg == EPSG and w.hh.shape == (120, 120)
    assert np.isnan(w.hh[60, 60]) and np.isnan(w.hh[61, 61]) and np.isnan(w.hh[0, 0])
    assert w.hh[10, 10] == pytest.approx(0.1)
    assert w.hv[10, 10] == pytest.approx(0.01)


def test_read_window_outside_product_returns_none(tmp_path):
    path = write_gcov(tmp_path / "a.h5", np.full((120, 120), 0.1))
    assert read_window(path, (10, 10, 10.1, 10.1)) is None


def test_read_window_handles_single_pol(tmp_path):
    w = read_window(write_gcov(tmp_path / "a.h5", np.full((120, 120), 0.1), hv=False), BOUNDS)
    assert w.hv is None


def test_change_detects_doubling_as_three_db():
    current = np.full((20, 20), 0.2)
    previous = np.full((20, 20), 0.1)
    assert np.nanmedian(change_db(current, previous)) == pytest.approx(3.01, abs=0.01)


def test_smoothing_ignores_nan_without_filling_it():
    v = np.ones((9, 9))
    v[4, 4] = np.nan
    out = smooth_nan(v)
    assert np.isnan(out[4, 4]) and out[4, 3] == pytest.approx(1.0)


def window_from(hh, x=None, y=None):
    dx, dy = utm_grid(hh.shape[0])
    return Window(EPSG, dx if x is None else x, dy if y is None else y, hh, hh / 10)


def test_align_crops_to_shared_pixels_and_keeps_orientation():
    x, y = utm_grid(10)
    hh = np.arange(100, dtype=np.float32).reshape(10, 10) + 1
    a = Window(EPSG, x, y, hh, None)
    b = Window(EPSG, x[3:], y[2:], hh[2:, 3:], None)
    a2, b2 = align(a, b)
    assert a2.hh.shape == (8, 7)
    assert np.array_equal(a2.hh, b2.hh)
    assert a2.y[0] > a2.y[-1]


def test_align_rejects_offset_grids():
    x, y = utm_grid(10)
    a = Window(EPSG, x, y, np.ones((10, 10)), None)
    b = Window(EPSG, x + 5, y, np.ones((10, 10)), None)
    assert align(a, b) is None


def test_polygon_mask_covers_expected_area():
    w = window_from(np.ones((100, 100)))
    assert polygon_mask(w, square(w, 0.25)).sum() == pytest.approx(2500, rel=0.1)


def test_sector_reports_share_of_changed_pixels():
    hh = np.full((100, 100), 0.1)
    w = window_from(hh)
    change = np.zeros((100, 100))
    change[:50] = 6.0
    s = summarize_sector(w, square(w), change, None)
    assert s["brighterPct"] == pytest.approx(50, abs=3)
    assert s["darkerPct"] == 0
    assert s["hhDb"] == pytest.approx(-10)
    assert s["validPct"] == 100


def test_sector_without_enough_valid_data_reports_nothing():
    hh = np.full((100, 100), np.nan)
    hh[:20] = 0.1
    w = window_from(hh)
    assert summarize_sector(w, square(w), None, None) is None


def scene(day, track=151, polarization="DHDH", frame=73):
    return Scene(f"s{track}-{day}", "u", datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(days=day), track, frame, "D", "2005", polarization)


def test_pairs_stay_inside_a_stack_and_skip_long_gaps():
    pairs = pair_passes([scene(0), scene(12), scene(100), scene(12, track=79), scene(24, polarization="SHSH")])
    links = {p.current.id: p.previous.id if p.previous else None for p in pairs}
    assert links == {"s151-0": None, "s151-12": "s151-0", "s151-100": None, "s79-12": None, "s151-24": None}
    assert pairs[0].current.acquired >= pairs[-1].current.acquired


def test_parse_scene_reads_stack_from_file_name():
    name = "NISAR_L2_PR_GCOV_033_151_D_073_2005_DHDH_A_20261022T162544_20261022T162618_P05023_N_F_J_001"
    props = {"fileID": name, "url": "u", "startTime": "2026-10-22T16:25:44Z", "frameCoverage": "Full", "collectionName": "NISAR_L2_GCOV_PROVISIONAL_V1"}
    s = parse_scene({"properties": props})
    assert s.stack == (151, 73, "D", "2005", "DHDH")
    assert parse_scene({"properties": {**props, "frameCoverage": "Partial"}}) is None
    assert parse_scene({"properties": {**props, "collectionName": "NISAR_L2_GCOV_BETA_V1"}}) is None


def test_outputs_are_north_up_with_correct_corners(tmp_path):
    w = window_from(np.ones((100, 100)))
    c = corners(w)
    assert c[0][1] > c[3][1] and c[1][0] > c[0][0]
    assert abs(c[0][0] - LON) < 0.02 and abs(c[0][1] - LAT) < 0.02

    change = np.zeros((100, 100))
    change[:10] = 8.0  # north edge, brighter
    write_change(change, w.y, tmp_path / "c.png")
    rgba = np.array(Image.open(tmp_path / "c.png"))
    assert rgba[5, 50, 3] == 255 and rgba[50, 50, 3] == 0
    assert rgba[5, 50, 2] > rgba[5, 50, 0]


def test_pass_measuring_no_sector_is_dropped_without_images(tmp_path):
    from nisar_pipeline.run import process_pair
    from nisar_pipeline.catalog import Pair

    class Reader:
        def window(self, _scene):
            return window_from(np.ones((100, 100)))

    far_away = {"id": "x", "polygon": [[1, 1], [1.1, 1], [1.1, 1.1], [1, 1]]}
    assert process_pair(Pair(scene(0), None), "gaza", [far_away], Reader(), tmp_path) is None
    assert list(tmp_path.iterdir()) == []


def test_scene_shift_is_removed_but_local_change_stays():
    change = np.full((10, 10), 1.0)
    change[0, 0] = 5.0
    corrected, shift = remove_scene_shift(change)
    assert shift == 1.0
    assert corrected[5, 5] == 0 and corrected[0, 0] == 4.0


def test_faulty_pass_is_not_compared():
    assert remove_scene_shift(np.full((10, 10), -4.8)) is None
    assert remove_scene_shift(np.full((10, 10), np.nan)) is None


def test_pipeline_drops_comparison_with_faulty_reference(tmp_path):
    from nisar_pipeline.run import process_pair
    from nisar_pipeline.catalog import Pair

    class Reader:
        def window(self, s):
            return window_from(np.full((100, 100), 0.3 if s.id == "s151-0" else 0.1))

    w = window_from(np.ones((100, 100)))
    entry = process_pair(Pair(scene(12), scene(0)), "lviv", [{"id": "a", "polygon": square(w)}], Reader(), tmp_path)
    assert entry["baselineDays"] is None and entry["images"]["change"] is None
    assert entry["sectors"]["a"]["hhDb"] == pytest.approx(-10) and entry["sectors"]["a"]["deltaHhDb"] is None
