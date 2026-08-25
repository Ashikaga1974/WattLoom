"""
analytics/-Paket: war bis Session 2026-08-25 eine einzelne 1767-Zeilen-Datei mit
allen /analytics/*-Endpunkten. Aufgeteilt nach Themen, damit einzelne Bereiche
(PMC/Fitness, Best-by-Distance, Zone-Distribution, restliche Übersichts-Charts)
unabhängig lesbar/testbar bleiben. Dieses __init__.py kombiniert die Sub-Router
zu einem einzigen `router` (main.py bindet weiterhin nur `analytics.router` ein)
und re-exportiert die Namen, die außerhalb des Pakets gebraucht werden.
"""
from fastapi import APIRouter

from . import overview, pmc, best_by_distance, zone_distribution
from ._shared import RIDE_TYPES, _hr_max_fallback, _effective_hr_max, _threshold_hr_pct, _ctl_atl_k
from .best_by_distance import (
    _best_by_distance_map,
    _clean_cumulative_distance,
    _fastest_segment,
    BEST_BY_DISTANCE_BUCKETS_KM,
    MAX_PLAUSIBLE_SPEED_MS,
)
from .pmc import fitness_fingerprint, performance_management_chart

router = APIRouter()
router.include_router(overview.router)
router.include_router(pmc.router)
router.include_router(best_by_distance.router)
router.include_router(zone_distribution.router)
