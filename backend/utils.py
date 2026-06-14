import math

_R_KM = 6_371.0


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
