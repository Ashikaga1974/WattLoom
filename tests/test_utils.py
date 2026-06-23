import math

import pytest

from backend.utils import haversine_km, haversine_m


def test_same_point_returns_zero():
    assert haversine_km(48.0, 11.0, 48.0, 11.0) == 0.0


def test_berlin_munich_approx_504km():
    # Luftlinie Berlin (52.52, 13.405) → München (48.137, 11.576)
    dist = haversine_km(52.52, 13.405, 48.137, 11.576)
    assert 500 < dist < 510


def test_haversine_m_is_km_times_1000():
    d_km = haversine_km(52.52, 13.405, 48.137, 11.576)
    d_m = haversine_m(52.52, 13.405, 48.137, 11.576)
    assert math.isclose(d_m, d_km * 1000.0, rel_tol=1e-9)


def test_symmetry():
    a = haversine_km(48.0, 11.0, 52.5, 13.4)
    b = haversine_km(52.5, 13.4, 48.0, 11.0)
    assert math.isclose(a, b, rel_tol=1e-9)


def test_one_degree_latitude_approx_111km():
    # 1° Breitengrad ≈ 111 km (auf dem Äquator exakt, bei 48° leicht abweichend)
    dist = haversine_km(0.0, 0.0, 1.0, 0.0)
    assert 110.0 < dist < 112.0


def test_short_distance_positive():
    # Nachbarpunkte (ca. 10 m): Distanz > 0
    dist = haversine_m(48.0, 11.0, 48.0001, 11.0)
    assert dist > 0.0


@pytest.mark.parametrize("lat1,lon1,lat2,lon2", [
    (0.0, 0.0, 0.0, 90.0),    # Viertel des Äquators ≈ 10 008 km
    (0.0, 0.0, 90.0, 0.0),    # Nord-Pol ≈ 10 008 km
])
def test_quarter_earth_approx_10000km(lat1, lon1, lat2, lon2):
    dist = haversine_km(lat1, lon1, lat2, lon2)
    assert 9_990 < dist < 10_020
