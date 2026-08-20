import bisect
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


TrackDistanceIndex = tuple[list[float], list[tuple[float, float]]]


def track_distance_index(rows: list[tuple[float, float, float]]) -> TrackDistanceIndex:
    """rows: (distance_m, lat, lon)-Tupel, aufsteigend nach distance_m sortiert erwartet.
    Gibt (dists, latlons) für nearest_track_point()/path_match_fraction() zurück."""
    return [r[0] for r in rows], [(r[1], r[2]) for r in rows]


def nearest_track_point(index: TrackDistanceIndex, target_m: float) -> tuple[float, float] | None:
    """Track-Punkt am nächsten zu einer absoluten Distanz-Marke, per Binärsuche (O(log n))
    statt einer SQL-Fensterfunktion – letztere skaliert bei vielen (Aktivität × Marke)-
    Kombinationen schlecht (siehe pr_detection/analytics.route_clusters-Historie)."""
    dists, pts = index
    if not dists:
        return None
    i = bisect.bisect_left(dists, target_m)
    if i <= 0:
        return pts[0]
    if i >= len(dists):
        return pts[-1]
    before, after = dists[i - 1], dists[i]
    return pts[i - 1] if (target_m - before) <= (after - target_m) else pts[i]


def path_match_fraction(
    index_a: TrackDistanceIndex,
    index_b: TrackDistanceIndex,
    mark_step_km: float = 2.0,
    mark_radius_km: float = 0.5,
    min_common_marks: int = 3,
    max_consecutive_miss: int = 1,
) -> float | None:
    """Anteil der gemeinsam abdeckbaren, absoluten Distanz-Marken (alle mark_step_km ab Start –
    nicht Prozent-Anteile der jeweils eigenen Gesamtdistanz, die bei unterschiedlich langen
    Fahrten auf unterschiedliche physische Orte zeigen würden), die innerhalb mark_radius_km
    liegen. None, wenn die Überlappung zu kurz für eine verlässliche Aussage ist.

    Ein zusammenhängender Lauf von mehr als max_consecutive_miss Fehltreffern disqualifiziert
    komplett (Rückgabe 0.0), unabhängig von der Gesamt-Trefferquote: 17 von 20 Treffern ergäben
    rechnerisch 85 %, auch wenn die 3 Fehltreffer alle am Streckenende zusammenhängen und real
    ein anderer Wegabschnitt sind (z.B. anderer Rückweg) statt verstreuter GPS-Ungenauigkeit –
    der Mittelwert allein hatte genau diesen Fall durchgelassen."""
    dists_a, dists_b = index_a[0], index_b[0]
    if not dists_a or not dists_b:
        return None
    max_common_m = min(dists_a[-1], dists_b[-1])
    step_m = mark_step_km * 1000.0
    marks = []
    m = step_m
    while m <= max_common_m:
        marks.append(m)
        m += step_m
    if len(marks) < min_common_marks:
        return None
    hits = 0
    consecutive_miss = 0
    max_run = 0
    for target_m in marks:
        pa = nearest_track_point(index_a, target_m)
        pb = nearest_track_point(index_b, target_m)
        if haversine_km(pa[0], pa[1], pb[0], pb[1]) <= mark_radius_km:
            hits += 1
            consecutive_miss = 0
        else:
            consecutive_miss += 1
            max_run = max(max_run, consecutive_miss)
    if max_run > max_consecutive_miss:
        return 0.0
    return hits / len(marks)
