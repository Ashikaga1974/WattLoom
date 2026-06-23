"""
Tests für die hrTSS- und CTL/ATL/TSB-Formeln aus analytics.py.

Die Berechnungen sind als Closure in den Endpoint eingebettet und können
nicht direkt importiert werden. Die Formeln werden hier 1:1 nachgebaut
und gegen bekannte Erwartungswerte geprüft.
"""
import math


# ── Formeln (identisch zu analytics.py) ──────────────────────────────────────

def calc_tss(duration_s, elapsed_s, hr, threshold_hr: float) -> float:
    """hrTSS-Berechnung aus analytics.py:performance_management_chart()."""
    dur = duration_s or elapsed_s or 0
    if dur <= 0:
        return 0.0
    if hr and hr > 0:
        if_hr = hr / threshold_hr
        return (dur / 3600.0) * (if_hr ** 2) * 100.0
    return (dur / 3600.0) * 50.0


K_CTL = 2.0 / 43.0   # 42-Tage-EMA
K_ATL = 2.0 / 8.0    # 7-Tage-EMA


def apply_ema(ctl: float, atl: float, tss: float) -> tuple[float, float]:
    """Einen EMA-Schritt anwenden (einen Tag)."""
    ctl = ctl + K_CTL * (tss - ctl)
    atl = atl + K_ATL * (tss - atl)
    return ctl, atl


# ── hrTSS ────────────────────────────────────────────────────────────────────

class TestHrTSS:
    def test_zero_duration_returns_zero(self):
        assert calc_tss(0, 0, 150, threshold_hr=170.0) == 0.0

    def test_none_duration_returns_zero(self):
        assert calc_tss(None, None, 150, threshold_hr=170.0) == 0.0

    def test_hr_at_threshold_gives_100_per_hour(self):
        # IF = 1.0 → TSS = 100 / Stunde
        tss = calc_tss(3600, None, 170, threshold_hr=170.0)
        assert math.isclose(tss, 100.0, rel_tol=1e-9)

    def test_hr_half_threshold_gives_25_per_hour(self):
        # IF = 0.5 → TSS = 0.5² × 100 = 25 / Stunde
        tss = calc_tss(3600, None, 85, threshold_hr=170.0)
        assert math.isclose(tss, 25.0, rel_tol=1e-6)

    def test_no_hr_fallback_50_per_hour(self):
        tss = calc_tss(3600, None, None, threshold_hr=170.0)
        assert math.isclose(tss, 50.0, rel_tol=1e-9)

    def test_hr_zero_uses_fallback(self):
        tss = calc_tss(3600, None, 0, threshold_hr=170.0)
        assert math.isclose(tss, 50.0, rel_tol=1e-9)

    def test_elapsed_used_when_moving_time_missing(self):
        tss_m = calc_tss(3600, None, 150, threshold_hr=170.0)
        tss_e = calc_tss(None, 3600, 150, threshold_hr=170.0)
        assert math.isclose(tss_m, tss_e, rel_tol=1e-9)

    def test_higher_hr_gives_higher_tss(self):
        tss_lo = calc_tss(3600, None, 130, threshold_hr=170.0)
        tss_hi = calc_tss(3600, None, 160, threshold_hr=170.0)
        assert tss_hi > tss_lo

    def test_longer_duration_gives_higher_tss(self):
        tss_short = calc_tss(1800, None, 150, threshold_hr=170.0)
        tss_long  = calc_tss(7200, None, 150, threshold_hr=170.0)
        assert tss_long > tss_short


# ── CTL / ATL / TSB ──────────────────────────────────────────────────────────

class TestCtlAtlEma:
    def test_initial_ctl_zero_one_day(self):
        # Startpunkt 0 → nach 1 Tag mit TSS=100: CTL = K_CTL × 100
        ctl, atl = apply_ema(0.0, 0.0, 100.0)
        assert math.isclose(ctl, K_CTL * 100.0, rel_tol=1e-9)

    def test_atl_rises_faster_than_ctl(self):
        # ATL-Fenster kleiner → reagiert schneller
        ctl, atl = apply_ema(0.0, 0.0, 100.0)
        assert atl > ctl

    def test_ctl_converges_to_steady_state(self):
        # Nach 300 Tagen mit konstantem TSS=100 → CTL ≈ 100
        ctl = atl = 0.0
        for _ in range(300):
            ctl, atl = apply_ema(ctl, atl, 100.0)
        assert math.isclose(ctl, 100.0, rel_tol=0.01)
        assert math.isclose(atl, 100.0, rel_tol=0.01)

    def test_tsb_zero_at_steady_state(self):
        ctl = atl = 0.0
        for _ in range(300):
            ctl, atl = apply_ema(ctl, atl, 100.0)
        assert math.isclose(ctl - atl, 0.0, abs_tol=0.5)

    def test_rest_days_raise_tsb(self):
        # Intensivblock → Pause → TSB wird positiv (ATL fällt schneller als CTL)
        ctl = atl = 0.0
        for _ in range(60):
            ctl, atl = apply_ema(ctl, atl, 100.0)
        for _ in range(7):
            ctl, atl = apply_ema(ctl, atl, 0.0)
        assert (ctl - atl) > 0

    def test_hard_block_lowers_tsb(self):
        # Ausgeglichener Ausgangszustand → harter Block → TSB sinkt
        ctl = atl = 50.0
        for _ in range(5):
            ctl, atl = apply_ema(ctl, atl, 200.0)
        assert (ctl - atl) < 0

    def test_zero_tss_causes_decay(self):
        # CTL/ATL fallen nach Trainingsunterbrechung
        ctl = atl = 80.0
        ctl_new, atl_new = apply_ema(ctl, atl, 0.0)
        assert ctl_new < ctl
        assert atl_new < atl

    def test_k_ctl_correct(self):
        # k = 2 / (N+1) mit N=42
        assert math.isclose(K_CTL, 2.0 / 43.0, rel_tol=1e-9)

    def test_k_atl_correct(self):
        # k = 2 / (N+1) mit N=7
        assert math.isclose(K_ATL, 2.0 / 8.0, rel_tol=1e-9)
