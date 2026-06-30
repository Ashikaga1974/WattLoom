import math
import statistics

_R_KM = 6_371.0
MS_TO_KMH = 3.6


def smooth_speeds(speeds: list[float | None], window: int = 5) -> list[float | None]:
    """Medianfilter über GPS-abgeleitete Geschwindigkeiten (Halbfenster = window//2).
    None-Werte bleiben None; nur Nicht-None-Nachbarn fließen in den Median ein."""
    half = window // 2
    result: list[float | None] = []
    for i, v in enumerate(speeds):
        if v is None:
            result.append(None)
            continue
        neighbours = [
            speeds[j]
            for j in range(max(0, i - half), min(len(speeds), i + half + 1))
            if speeds[j] is not None
        ]
        result.append(statistics.median(neighbours))
    return result


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Luftlinien-Distanz zweier GPS-Koordinaten in Kilometern."""
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(dlon / 2) ** 2)
    a = max(0.0, min(1.0, a))
    return _R_KM * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Luftlinien-Distanz zweier GPS-Koordinaten in Metern."""
    return haversine_km(lat1, lon1, lat2, lon2) * 1_000.0
