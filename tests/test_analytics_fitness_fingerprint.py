"""
Tests für backend/api/analytics/pmc.py: fitness_fingerprint().

Die Scoring-Funktionen (ctl_score_fn, form_score_fn, score_level, ...) sind
Closures im Endpoint und nicht direkt importierbar - analog zum Muster in
test_analytics_pmc.py werden sie hier 1:1 nachgebaut. score_level() ist der
schärfste Test: die Stufen-Reihenfolge war schon einmal verwirrend benannt
(Session 2026-08-22), ein Schwellenwert-Fehler soll hier künftig auffallen.

Zusätzlich ein paar End-to-End-Tests gegen den echten Endpunkt (relative
Datumsangaben zu date.today(), damit die Tests unabhängig vom Ausführungs-
zeitpunkt deterministisch bleiben).
"""
from contextlib import contextmanager
from datetime import date, timedelta

import backend.api.analytics.pmc as analytics
from backend.api.analytics.pmc import fitness_fingerprint


def _patch_db(monkeypatch, conn):
    @contextmanager
    def fake_db_connection():
        yield conn
    monkeypatch.setattr(analytics, "db_connection", fake_db_connection)


# ── Scoring-Formeln (identisch zu analytics.py:fitness_fingerprint()) ───────

def ctl_score_fn(ctl: float) -> float:
    return round(min(35.0, ctl * 35.0 / 80.0), 1)


def form_score_fn(tsb: float) -> float:
    if 5.0 <= tsb <= 20.0:          return 20.0
    if 20.0 < tsb <= 30.0:          return 16.0
    if 0.0 <= tsb < 5.0:            return 14.0
    if tsb > 30.0:                   return 10.0
    if -10.0 <= tsb < 0.0:          return 9.0
    if -20.0 <= tsb < -10.0:        return 4.0
    return 0.0


def eff_score_fn(eff, all_effs) -> float:
    if not all_effs or eff is None:
        return 0.0
    pct = sum(1 for e in all_effs if e <= eff) / len(all_effs)
    return round(pct * 25.0, 1)


def score_level(s: int) -> str:
    if s >= 90: return "Elite"
    if s >= 75: return "Amateur"
    if s >= 60: return "Fortgeschritten"
    if s >= 45: return "Enthusiast"
    if s >= 30: return "Aktiv"
    return "Einsteiger"


class TestCtlScore:
    def test_zero_ctl_zero_points(self):
        assert ctl_score_fn(0.0) == 0.0

    def test_ctl_80_hits_cap(self):
        assert ctl_score_fn(80.0) == 35.0

    def test_ctl_above_80_still_capped(self):
        assert ctl_score_fn(150.0) == 35.0

    def test_ctl_40_gives_half_points(self):
        assert ctl_score_fn(40.0) == 17.5


class TestFormScore:
    def test_optimal_freshness_range(self):
        assert form_score_fn(5.0) == 20.0
        assert form_score_fn(20.0) == 20.0

    def test_boundary_just_above_optimal(self):
        assert form_score_fn(20.1) == 16.0

    def test_very_fresh_penalized_vs_optimal(self):
        assert form_score_fn(35.0) == 10.0
        assert form_score_fn(35.0) < form_score_fn(10.0)

    def test_deep_fatigue_lowest_nonzero(self):
        assert form_score_fn(-15.0) == 4.0

    def test_extreme_fatigue_zero(self):
        assert form_score_fn(-25.0) == 0.0


class TestEfficiencyScore:
    def test_no_history_zero(self):
        assert eff_score_fn(5.0, []) == 0.0

    def test_none_value_zero(self):
        assert eff_score_fn(None, [1.0, 2.0, 3.0]) == 0.0

    def test_median_gives_roughly_half(self):
        all_effs = [1.0, 2.0, 3.0, 4.0, 5.0]
        assert eff_score_fn(3.0, all_effs) == 15.0  # 3/5 <= 3.0 -> 60% * 25

    def test_best_ever_gives_full_score(self):
        all_effs = [1.0, 2.0, 3.0]
        assert eff_score_fn(3.0, all_effs) == 25.0


class TestScoreLevel:
    """Regressionsschutz für die Stufen-Reihenfolge (Session 2026-08-22: 'Amateur'
    lag sprachlich verwirrend über 'Fortgeschritten' - das interne Schwellenwert-
    Ranking selbst muss aber immer aufsteigend mit dem Score sein."""

    def test_thresholds_strictly_increase_with_score(self):
        scores = list(range(0, 101, 1))
        levels_in_order = ["Einsteiger", "Aktiv", "Enthusiast", "Fortgeschritten", "Amateur", "Elite"]
        seen_order = []
        for s in scores:
            lvl = score_level(s)
            if lvl not in seen_order:
                seen_order.append(lvl)
        assert seen_order == levels_in_order

    def test_boundary_values(self):
        assert score_level(29) == "Einsteiger"
        assert score_level(30) == "Aktiv"
        assert score_level(44) == "Aktiv"
        assert score_level(45) == "Enthusiast"
        assert score_level(59) == "Enthusiast"
        assert score_level(60) == "Fortgeschritten"
        assert score_level(74) == "Fortgeschritten"
        assert score_level(75) == "Amateur"
        assert score_level(89) == "Amateur"
        assert score_level(90) == "Elite"

    def test_higher_score_never_yields_lower_level_rank(self):
        rank = {"Einsteiger": 0, "Aktiv": 1, "Enthusiast": 2, "Fortgeschritten": 3, "Amateur": 4, "Elite": 5}
        prev_rank = -1
        for s in range(0, 101):
            r = rank[score_level(s)]
            assert r >= prev_rank
            prev_rank = r


# ── End-to-End über den echten Endpunkt ─────────────────────────────────────

def _insert_ride(conn, activity_id, days_ago, avg_hr=140, moving_time_s=3600, avg_speed_ms=8.0):
    d = (date.today() - timedelta(days=days_ago)).isoformat() + "T08:00:00"
    conn.execute(
        "INSERT INTO activities (id, activity_type, start_date_local, moving_time_s, "
        "elapsed_time_s, avg_hr, avg_speed_ms) VALUES (?, 'ride', ?, ?, ?, ?, ?)",
        (activity_id, d, moving_time_s, moving_time_s, avg_hr, avg_speed_ms),
    )


class TestFitnessFingerprintEndpoint:
    def test_no_data_returns_zero_score_einsteiger(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        result = fitness_fingerprint()
        assert result["score"] == 0
        assert result["level"] == "Einsteiger"
        assert result["history"] == []

    def test_score_never_exceeds_100(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        for i in range(120):
            _insert_ride(db, i + 1, days_ago=i, avg_hr=175, moving_time_s=7200, avg_speed_ms=10.0)
        result = fitness_fingerprint()
        assert 0 <= result["score"] <= 100

    def test_components_sum_matches_total_score(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        for i in range(30):
            _insert_ride(db, i + 1, days_ago=i * 2, avg_hr=150, moving_time_s=3600, avg_speed_ms=8.0)
        result = fitness_fingerprint()
        comp_sum = round(sum(c["score"] for c in result["components"].values()))
        assert comp_sum == result["score"]

    def test_consistent_weekly_riding_gives_full_consistency_score(self, db, monkeypatch):
        _patch_db(monkeypatch, db)
        # Jede Woche der letzten 8 Wochen mindestens ein Ride
        for w in range(8):
            _insert_ride(db, w + 1, days_ago=w * 7 + 1)
        result = fitness_fingerprint()
        assert result["components"]["consistency"]["score"] == 20.0
        assert result["components"]["consistency"]["value"] == 8
