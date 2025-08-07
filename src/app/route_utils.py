from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import List, Tuple
import xml.etree.ElementTree as ET

from geopy.distance import geodesic

# Default time configuration. These values are used when the application starts
# but can be overridden at runtime via the configuration page.
START_TIME = datetime(2024, 8, 10, tzinfo=timezone.utc)
END_TIME = datetime(2024, 8, 20, tzinfo=timezone.utc)

# Colors for each day's segment
COLORS = [
    "#ff0000",
    "#ff7f00",
    "#ffff00",
    "#7fff00",
    "#00ff00",
    "#00ffff",
    "#0000ff",
    "#8b00ff",
    "#ff00ff",
    "#ff007f",
]


def parse_kml(file_path: Path) -> List[Tuple[float, float]]:
    """Extract coordinates from a KML LineString."""
    tree = ET.parse(file_path)
    root = tree.getroot()
    ns = {"kml": "http://www.opengis.net/kml/2.2"}
    coords: List[Tuple[float, float]] = []
    for coord_text in root.findall(".//kml:LineString/kml:coordinates", ns):
        pairs = coord_text.text.strip().split()
        for pair in pairs:
            lon, lat, *_ = pair.split(",")
            coords.append((float(lat), float(lon)))
    return coords


def compute_total_distance(coords: List[Tuple[float, float]]) -> float:
    """Calculate the total geodesic distance of the route in kilometers."""
    distance = 0.0
    for i in range(1, len(coords)):
        distance += geodesic(coords[i - 1], coords[i]).kilometers
    return distance


def split_into_segments(
    coords: List[Tuple[float, float]], segment_len_km: float
) -> List[List[Tuple[float, float]]]:
    """Split coordinates into segments of approximately ``segment_len_km``."""
    segments: List[List[Tuple[float, float]]] = []
    current_segment: List[Tuple[float, float]] = [coords[0]]
    current_len = 0.0
    for i in range(1, len(coords)):
        prev = coords[i - 1]
        cur = coords[i]
        step = geodesic(prev, cur).kilometers
        while current_len + step >= segment_len_km:
            ratio = (segment_len_km - current_len) / step
            lat = prev[0] + (cur[0] - prev[0]) * ratio
            lon = prev[1] + (cur[1] - prev[1]) * ratio
            current_segment.append((lat, lon))
            segments.append(current_segment)
            prev = (lat, lon)
            step = geodesic(prev, cur).kilometers
            current_segment = [prev]
            current_len = 0.0
        current_segment.append(cur)
        current_len += step
    if current_segment:
        segments.append(current_segment)
    return segments


def build_geojson(segments: List[List[Tuple[float, float]]]) -> dict:
    """Create a GeoJSON FeatureCollection for the segments."""
    features = []
    for idx, segment in enumerate(segments):
        coords = [[lon, lat] for lat, lon in segment]
        features.append(
            {
                "type": "Feature",
                "properties": {"day": idx + 1, "color": COLORS[idx % len(COLORS)]},
                "geometry": {"type": "LineString", "coordinates": coords},
            }
        )
    return {"type": "FeatureCollection", "features": features}


def load_route(
    data_dir: Path,
    start_time: datetime | None = None,
    end_time: datetime | None = None,
) -> tuple[dict, dict]:
    """Load KML files and build route data for the given time window.

    If ``start_time`` or ``end_time`` are ``None`` the module level defaults
    ``START_TIME`` and ``END_TIME`` are used.  This allows the application to
    recompute route segments when the user adjusts the date range.
    """

    start_time = start_time or START_TIME
    end_time = end_time or END_TIME

    files = sorted(data_dir.glob("*.kml"))
    if not files:
        raise FileNotFoundError("No KML files found in data directory")

    coords: List[Tuple[float, float]] = []
    for file in files:
        coords.extend(parse_kml(file))

    total_distance_km = compute_total_distance(coords)

    days = max((end_time - start_time).days, 1)
    daily_distance = total_distance_km / days
    segments = split_into_segments(coords, daily_distance)
    geojson = build_geojson(segments)

    duration_seconds = max((end_time - start_time).total_seconds(), 1)
    speed_mps = total_distance_km * 1000 / duration_seconds

    meta = {
        "total_distance_km": total_distance_km,
        "daily_distance_km": daily_distance,
        "speed_mps": speed_mps,
        "start_time": start_time.isoformat(),
        "end_time": end_time.isoformat(),
        "days": days,
    }
    return geojson, meta
