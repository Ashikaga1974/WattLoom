"""
Leistungsschätzung ohne Powermeter aus GPS/Höhen/Geschwindigkeitsdaten.

Physikalisches Modell:
  P_gesamt = P_roll + P_steigung + P_aero
           = m·g·Crr·v  +  m·g·gradient·v  +  0.5·ρ·CdA·v³

Physikalisch basierte Schätzung, keine Messung – die Genauigkeit hängt insbesondere von
Wind (keine Windmessung, nur Vorwärtsgeschwindigkeit), CdA, Crr, GPS-Höhenrauschen und
Geschwindigkeitsgenauigkeit ab und schwankt dadurch je nach Bedingungen.
Negative Leistung (Bergab/Freilauf) wird auf 0 geklammert.
"""
import math
import sqlite3
import logging
from datetime import datetime, timezone

from backend.utils import haversine_m

logger = logging.getLogger(__name__)

# ── Physikalische Konstante ──────────────────────────────────────────────────
_G = 9.81  # m/s²

# ── Standardwerte (Rennrad, Rennposition) ───────────────────────────────────
DEFAULT_CRR      = 0.004   # Rollwiderstandskoeffizient: Rennreifen auf Asphalt
DEFAULT_CDA      = 0.32    # CdA (m²): Rennposition / Drops; Hoods ~0.36
DEFAULT_BIKE_KG  = 8.0     # Fahrradgewicht inkl. Anbauteile (kg)
DEFAULT_ALT_M    = 200.0   # Fallback-Höhe wenn kein Höhenprofil (z.B. Amazfit): Flachland, ~mittlere DE-Höhe
MIN_SPEED_MS     = 0.5     # < 1.8 km/h → Stillstand, kein Treten
NP_WINDOW_S      = 30      # Coggan Normalized-Power-Fenster (Sekunden)
ALT_SMOOTH_WIN   = 7       # Glättungsfenster für GPS-Höhenrauschen (Punkte)
MAX_GRADIENT     = 0.40    # Grenzwert ±40 % – alles drüber ist GPS-Artefakt
MIN_POINTS       = 20      # Mindest-Track-Punkte für sinnvolle Schätzung


# ── Luftdichte ───────────────────────────────────────────────────────────────

def _air_density(altitude_m: float, temp_c: float = 15.0) -> float:
    """
    Luftdichte ρ (kg/m³) aus Höhe und Temperatur.
    Standardatmosphäre: barometrische Höhenformel + ideales Gasgesetz.
    Auf Meereshöhe bei 15 °C: 1.225 kg/m³.
    Bei 1 000 m / 20 °C: ≈ 1.10 kg/m³ – Unterschied aero ~10 %.
    """
    rho0 = 1.225                                  # kg/m³ bei 0 m / 15 °C
    p_ratio = math.exp(-altitude_m / 8500.0)      # Druckabfall mit Höhe
    t_ratio = 288.15 / (273.15 + temp_c)          # Temperaturkorrektur
    return rho0 * p_ratio * t_ratio


# ── Gleitender Durchschnitt ──────────────────────────────────────────────────

def _smooth(values: list[float], window: int) -> list[float]:
    """Zentrierter gleitender Durchschnitt; Randbehandlung via Clipping."""
    n = len(values)
    half = window // 2
    result = []
    for i in range(n):
        lo = max(0, i - half)
        hi = min(n, i + half + 1)
        result.append(sum(values[lo:hi]) / (hi - lo))
    return result


# ── Timestamp-Parsing ────────────────────────────────────────────────────────

def _parse_ts(ts_str: str | None) -> float | None:
    """ISO8601-String → Unix-Sekunden; None wenn leer oder ungültig."""
    if not ts_str:
        return None
    try:
        s = ts_str if "+" in ts_str or ts_str.endswith("Z") else ts_str + "+00:00"
        s = s.replace("Z", "+00:00")
        return datetime.fromisoformat(s).timestamp()
    except (ValueError, AttributeError):
        return None


# ── Normalized Power (Coggan) ────────────────────────────────────────────────

def _normalized_power(
    times: list[float],
    powers: list[float],
    window_s: int,
) -> float | None:
    """
    NP nach Coggan: (mean( rolling_avg_30s ^ 4 )) ^ 0.25

    Zeitbasiertes Schiebefenster mit O(n) Zwei-Zeiger-Algorithmus.
    Falls keine Timestamps vorhanden: Index-basiertes Fallback (~1 Hz).

    Wichtig: "n" ist die Punktanzahl, nicht zwangsläufig die Sekundenzahl (Aufzeichnung
    kann z.B. mit 2 Hz oder 0,5 Hz statt 1 Hz laufen) – die Mindestlänge wird deshalb bei
    vorhandenen Timestamps über die tatsächliche Zeitspanne geprüft, nicht über len(powers).
    Ebenso gehen nur vollständige 30-Sekunden-Fenster in die Mittelung ein (die ersten
    <30s der Fahrt liefern sonst verzerrte, zu kurze Fenster).
    """
    n = len(powers)
    if n == 0:
        return None

    has_times = len(times) == n and any(t is not None and t > 0 for t in times)

    # Präfix-Summen für O(n) Fenster-Mittelwert
    prefix = [0.0] * (n + 1)
    for i, p in enumerate(powers):
        prefix[i + 1] = prefix[i] + p

    if has_times:
        # Timestamps vorhanden → echte 30-Sekunden-Fenster über die Zeitspanne prüfen,
        # nicht über die Punktanzahl (unterschiedliche Aufzeichnungsraten möglich)
        ts = [t if t is not None else 0.0 for t in times]
        if ts[-1] - ts[0] < window_s:
            return None
        left = 0
        rolling = []
        for i in range(n):
            # Linken Rand vorschieben: ältere Punkte als t_i − 30 s ausblenden
            while ts[left] < ts[i] - window_s:
                left += 1
            if ts[i] - ts[0] < window_s:
                # Noch kein vollständiges 30s-Fenster erreicht → nicht in NP-Mittel aufnehmen
                continue
            count = i - left + 1
            avg = (prefix[i + 1] - prefix[left]) / count
            rolling.append(avg)
    else:
        # Kein Timestamp → Index als Sekunden-Näherung (~1 Hz)
        if n < window_s:
            return None
        left = 0
        rolling = []
        for i in range(n):
            while i - left >= window_s:
                left += 1
            if i < window_s - 1:
                continue
            count = i - left + 1
            avg = (prefix[i + 1] - prefix[left]) / count
            rolling.append(avg)

    if not rolling:
        return None

    mean_p4 = sum(r ** 4 for r in rolling) / len(rolling)
    return mean_p4 ** 0.25


# ── Kern-Berechnung ──────────────────────────────────────────────────────────

def estimate_power(
    conn: sqlite3.Connection,
    activity_id: int,
    weight_kg: float,
    bike_kg: float = DEFAULT_BIKE_KG,
    crr: float = DEFAULT_CRR,
    cda: float = DEFAULT_CDA,
    temp_c: float = 15.0,
) -> tuple[float | None, float | None]:
    """
    Berechnet (est_avg_power_w, est_norm_power_w) für eine Aktivität.

    Liest track_points und (optional) weather_temp_c aus der DB.
    Gibt (None, None) zurück wenn zu wenig Daten vorhanden.
    """
    rows = conn.execute(
        """SELECT timestamp, lat, lon, altitude_m, speed_ms
           FROM track_points
           WHERE activity_id = ?
           ORDER BY timestamp""",
        (activity_id,),
    ).fetchall()

    # Validiere Punkte: lat/lon/speed Pflicht; altitude_m optional (Fallback: Flachland)
    pts = []
    for r in rows:
        if (r["lat"] is not None and r["lon"] is not None
                and r["speed_ms"] is not None
                and r["speed_ms"] >= 0):
            pts.append({
                "ts":  _parse_ts(r["timestamp"]),
                "lat": r["lat"],
                "lon": r["lon"],
                "alt": r["altitude_m"],  # kann None sein (z.B. Amazfit ohne Barometer)
                "v":   r["speed_ms"],
            })

    if len(pts) < MIN_POINTS:
        logger.debug("activity %s: nur %d gültige Track-Punkte – Schätzung übersprungen",
                     activity_id, len(pts))
        return None, None

    # Wetter-Temperatur nutzen wenn vorhanden
    wx = conn.execute(
        "SELECT weather_temp_c FROM activities WHERE id = ?", (activity_id,)
    ).fetchone()
    if wx and wx["weather_temp_c"] is not None:
        temp_c = wx["weather_temp_c"]

    total_mass = weight_kg + bike_kg

    # Höhe glätten – reduziert GPS-Rauschen deutlich (~1–2 m Amplitudenfehler)
    # Fehlende Höhenwerte (kein Barometer/GPS-Höhe) → DEFAULT_ALT_M; gradient bleibt 0
    raw_alts = [p["alt"] if p["alt"] is not None else DEFAULT_ALT_M for p in pts]
    alts = _smooth(raw_alts, window=ALT_SMOOTH_WIN)

    powers: list[float] = []
    times:  list[float | None] = []
    # Für avg_power_w getrennt erfasst: nur Bewegungs-Phasen, zeitgewichtet (siehe unten) –
    # powers/times oben bleiben komplett (inkl. Stillstand als 0 W) für die NP-Fensterbildung.
    moving_powers: list[float] = []
    moving_weights: list[float] = []

    for i in range(1, len(pts)):
        v = pts[i]["v"]

        # Zeitdifferenz zum Vorpunkt – Gewicht für die zeitbasierte avg_power-Mittelung
        ts_prev, ts_cur = pts[i - 1]["ts"], pts[i]["ts"]
        dt = (ts_cur - ts_prev) if (ts_prev is not None and ts_cur is not None and ts_cur > ts_prev) else None

        if v < MIN_SPEED_MS:
            # Stillstand: Leistung = 0, Zeitstempel trotzdem aufzeichnen für NP-Fenster;
            # fließt bewusst NICHT in avg_power_w ein (das soll die Leistung während der
            # Fahrt zeigen, nicht durch Ampeln/Pausen künstlich nach unten gezogen werden)
            powers.append(0.0)
            times.append(pts[i]["ts"])
            continue

        # Horizontale Distanz (Haversine) für Gradientenberechnung
        dist = haversine_m(
            pts[i - 1]["lat"], pts[i - 1]["lon"],
            pts[i]["lat"],     pts[i]["lon"],
        )

        if dist < 1.0:
            # Punkte am selben Ort → Gradient nicht berechenbar
            gradient = 0.0
        else:
            dh = alts[i] - alts[i - 1]
            gradient = max(-MAX_GRADIENT, min(MAX_GRADIENT, dh / dist))

        rho = _air_density(alts[i], temp_c)

        p_roll = crr * total_mass * _G * v          # Rollwiderstand
        p_grav = total_mass * _G * gradient * v     # Steigungsarbeit
        p_aero = 0.5 * rho * cda * v ** 3          # Luftwiderstand

        # Bergab/Freilauf → 0 (kein Antrieb)
        p = max(0.0, p_roll + p_grav + p_aero)
        powers.append(p)
        times.append(pts[i]["ts"])

        moving_powers.append(p)
        moving_weights.append(dt if dt is not None else 1.0)

    if not powers:
        return None, None

    # avg_power_w zeitgewichtet über die Bewegungsphasen (nicht einfach über Punktanzahl –
    # bei ungleichmäßiger Aufzeichnungsrate würde das sonst falsch gewichtet)
    if moving_powers:
        total_weight = sum(moving_weights)
        avg_w = (
            sum(p * w for p, w in zip(moving_powers, moving_weights)) / total_weight
            if total_weight > 0 else sum(moving_powers) / len(moving_powers)
        )
    else:
        avg_w = 0.0

    norm_w = _normalized_power(times, powers, NP_WINDOW_S) or avg_w

    return round(avg_w, 1), round(norm_w, 1)


# ── High-Level-Helfer (für Importer und Bulk-Endpoint) ──────────────────────

def _get_weight_kg(conn: sqlite3.Connection) -> float | None:
    """Lädt weight_kg aus der config-Tabelle; None wenn nicht gesetzt."""
    row = conn.execute("SELECT value FROM config WHERE key = 'weight_kg'").fetchone()
    if not row:
        return None
    try:
        v = float(row["value"])
        return v if v > 0 else None
    except (TypeError, ValueError):
        return None


def _get_float_setting(conn: sqlite3.Connection, key: str, default: float) -> float:
    """Lädt einen Float-Wert aus der config-Tabelle; Default wenn nicht gesetzt/ungültig."""
    row = conn.execute("SELECT value FROM config WHERE key = ?", (key,)).fetchone()
    if not row:
        return default
    try:
        return float(row["value"])
    except (TypeError, ValueError):
        return default


def estimate_and_store(conn: sqlite3.Connection, activity_id: int) -> bool:
    """
    Kompletter Ablauf für eine Aktivität:
    1. weight_kg + crr/cda/bike_kg aus config lesen
    2. estimate_power() aufrufen
    3. est_avg_power_w / est_norm_power_w in activities schreiben

    Gibt True zurück wenn Werte gespeichert wurden, sonst False.
    """
    weight_kg = _get_weight_kg(conn)
    if weight_kg is None:
        logger.debug("activity %s: weight_kg nicht gesetzt – Leistungsschätzung übersprungen",
                     activity_id)
        return False

    bike_kg = _get_float_setting(conn, "bike_kg", DEFAULT_BIKE_KG)
    crr = _get_float_setting(conn, "crr", DEFAULT_CRR)
    cda = _get_float_setting(conn, "cda", DEFAULT_CDA)

    avg_w, norm_w = estimate_power(conn, activity_id, weight_kg, bike_kg=bike_kg, crr=crr, cda=cda)
    if avg_w is None:
        return False

    with conn:
        conn.execute(
            "UPDATE activities SET est_avg_power_w = ?, est_norm_power_w = ? WHERE id = ?",
            (avg_w, norm_w, activity_id),
        )
    logger.info("activity %s: geschätzte Leistung %d W (NP %d W)", activity_id,
                int(avg_w), int(norm_w))
    return True
