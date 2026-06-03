"""
Backfill: kumulative Haversine-Distanz für track_points ohne distance_m berechnen.
Betrifft TCX-Aktivitäten die kein DistanceMeters pro Trackpoint liefern.
"""

import math
import sqlite3
import sys
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "mybiking.db"


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6_371_000
    p = math.pi / 180
    a = (math.sin((lat2 - lat1) * p / 2) ** 2
         + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(a))


def backfill():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    # Aktivitäten mit mind. einem Punkt ohne distance_m aber mit lat
    act_ids = [
        r[0] for r in conn.execute("""
            SELECT DISTINCT activity_id
            FROM track_points
            WHERE distance_m IS NULL AND lat IS NOT NULL
            ORDER BY activity_id
        """).fetchall()
    ]

    print(f"Backfill für {len(act_ids)} Aktivitäten...")

    total_updated = 0
    for i, act_id in enumerate(act_ids):
        rows = conn.execute("""
            SELECT id, lat, lon, distance_m
            FROM track_points
            WHERE activity_id = ?
            ORDER BY timestamp
        """, (act_id,)).fetchall()

        # Prüfen ob gemischte Situation (manche haben distance_m, manche nicht)
        # Wenn irgendein Punkt native distance_m hat → überspringen (Mischfall, nicht anfassen)
        has_native = any(r["distance_m"] is not None for r in rows)
        if has_native:
            continue

        updates = []
        cum_dist = 0.0
        prev_lat = prev_lon = None

        for row in rows:
            lat, lon = row["lat"], row["lon"]
            if lat is not None and lon is not None:
                if prev_lat is not None:
                    cum_dist += haversine_m(prev_lat, prev_lon, lat, lon)
                prev_lat, prev_lon = lat, lon
            updates.append((cum_dist, row["id"]))

        conn.executemany(
            "UPDATE track_points SET distance_m = ? WHERE id = ?",
            updates
        )
        conn.commit()
        total_updated += len(updates)

        if (i + 1) % 10 == 0 or i == len(act_ids) - 1:
            print(f"  {i + 1}/{len(act_ids)} Aktivitäten, {total_updated} Punkte aktualisiert")

    conn.close()
    print(f"\nFertig: {total_updated} track_points mit distance_m befüllt.")


if __name__ == "__main__":
    backfill()
