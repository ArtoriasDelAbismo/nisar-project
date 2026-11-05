"""Finds comparable NISAR GCOV passes through ASF's public search API."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

import requests

ASF_SEARCH_URL = "https://api.daac.asf.alaska.edu/services/search/param"
# Repeat passes are 12 days apart; this allows a missed pass or the mission's Jul-Aug 2026 gap.
MAX_BASELINE_DAYS = 36


@dataclass(frozen=True)
class Scene:
    id: str
    url: str
    acquired: datetime
    track: int
    frame: int
    direction: str
    mode: str
    polarization: str

    @property
    def stack(self) -> tuple[int, int, str, str, str]:
        """Only passes in the same stack share viewing geometry and radar settings."""
        return (self.track, self.frame, self.direction, self.mode, self.polarization)


@dataclass(frozen=True)
class Pair:
    current: Scene
    previous: Scene | None

    @property
    def baseline_days(self) -> int | None:
        if self.previous is None:
            return None
        return round((self.current.acquired - self.previous.acquired).total_seconds() / 86400)


def parse_scene(feature: dict) -> Scene | None:
    """Returns None for products that can't be compared: partial, or not PROVISIONAL quality."""
    p = feature["properties"]
    if p.get("frameCoverage") != "Full" or "PROVISIONAL" not in p.get("collectionName", ""):
        return None
    # NISAR_L2_PR_GCOV_<cycle>_<track>_<dir>_<frame>_<mode>_<pol>_...
    parts = p["fileID"].split("_")
    return Scene(
        id=p["fileID"],
        url=p["url"],
        acquired=datetime.fromisoformat(p["startTime"].replace("Z", "+00:00")),
        track=int(parts[5]),
        direction=parts[6],
        frame=int(parts[7]),
        mode=parts[8],
        polarization=parts[9],
    )


def search(lon: float, lat: float, session: requests.Session | None = None) -> list[Scene]:
    response = (session or requests).get(
        ASF_SEARCH_URL,
        params={
            "dataset": "NISAR",
            "processingLevel": "GCOV",
            "intersectsWith": f"POINT({lon} {lat})",
            "maxResults": 250,
            "output": "geojson",
        },
        timeout=120,
    )
    response.raise_for_status()
    newest: dict[tuple, Scene] = {}
    for feature in response.json()["features"]:
        scene = parse_scene(feature)
        if scene is None:
            continue
        key = (*scene.stack, scene.acquired.date())
        if key not in newest or scene.id > newest[key].id:  # highest product counter wins
            newest[key] = scene
    return list(newest.values())


def pair_passes(scenes: list[Scene]) -> list[Pair]:
    """Links each scene to the previous pass in its stack, newest pairs first."""
    pairs: list[Pair] = []
    stacks: dict[tuple, list[Scene]] = {}
    for scene in scenes:
        stacks.setdefault(scene.stack, []).append(scene)
    for stack in stacks.values():
        stack.sort(key=lambda s: s.acquired)
        previous = None
        for scene in stack:
            usable = previous and (scene.acquired - previous.acquired).days <= MAX_BASELINE_DAYS
            pairs.append(Pair(scene, previous if usable else None))
            previous = scene
    return sorted(pairs, key=lambda pair: pair.current.acquired, reverse=True)
