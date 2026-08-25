from fastapi import APIRouter

from . import bikes as bikes
from . import components as components
from ._shared import _current_bike_km, _avg_km_per_day, _chain_maintenance_km, _enrich_component

router = APIRouter()
router.include_router(bikes.router)
router.include_router(components.router)
