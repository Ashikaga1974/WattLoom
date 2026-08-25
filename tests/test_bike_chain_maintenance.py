"""
Tests für das Ketten-Pflegeintervall (Reinigen/Ölen) in backend/api/bikes.py: _enrich_component()
berechnet km_since_maintenance/maintenance_pct_used unabhängig vom Verschleiß-Tracking
(km_at_service/km_threshold), siehe CLAUDE.md-Abschnitt "Ketten-Pflegeintervall".
"""
from backend.api.bikes import _enrich_component


def _chain(**overrides):
    comp = {
        "type": "chain",
        "km_threshold": 2000,
        "km_at_service": 0,
        "last_maintained_at": None,
        "last_maintained_km": None,
    }
    comp.update(overrides)
    return comp


class TestChainMaintenance:
    def test_never_maintained_falls_back_to_km_at_service(self):
        comp = _chain(km_at_service=100)
        result = _enrich_component(comp, current_km=250, avg_km_per_day=None, maintenance_threshold=300)
        assert result["km_since_maintenance"] == 150
        assert result["maintenance_pct_used"] == 50.0

    def test_after_maintain_resets_from_last_maintained_km(self):
        comp = _chain(km_at_service=100, last_maintained_km=400, last_maintained_at="2026-08-01")
        result = _enrich_component(comp, current_km=550, avg_km_per_day=None, maintenance_threshold=300)
        assert result["km_since_maintenance"] == 150
        assert result["maintenance_pct_used"] == 50.0

    def test_reaches_80_percent_warning_threshold(self):
        comp = _chain(last_maintained_km=0)
        result = _enrich_component(comp, current_km=240, avg_km_per_day=None, maintenance_threshold=300)
        assert result["maintenance_pct_used"] == 80.0

    def test_capped_at_200_percent(self):
        comp = _chain(last_maintained_km=0)
        result = _enrich_component(comp, current_km=1000, avg_km_per_day=None, maintenance_threshold=300)
        assert result["maintenance_pct_used"] == 200.0

    def test_non_chain_component_has_no_maintenance_fields(self):
        comp = {"type": "cassette", "km_threshold": 8000, "km_at_service": 0}
        result = _enrich_component(comp, current_km=500, avg_km_per_day=None, maintenance_threshold=300)
        assert result["km_since_maintenance"] is None
        assert result["maintenance_pct_used"] is None

    def test_no_threshold_configured_yields_none(self):
        comp = _chain()
        result = _enrich_component(comp, current_km=500, avg_km_per_day=None, maintenance_threshold=None)
        assert result["km_since_maintenance"] is None
        assert result["maintenance_pct_used"] is None

    def test_current_km_below_last_maintained_km_clamped_to_zero(self):
        # Kann bei nachträglich korrigiertem Einbaudatum/Aktivitäten vorkommen
        comp = _chain(last_maintained_km=500)
        result = _enrich_component(comp, current_km=300, avg_km_per_day=None, maintenance_threshold=300)
        assert result["km_since_maintenance"] == 0.0
        assert result["maintenance_pct_used"] == 0.0

    def test_wear_calculation_unaffected_by_maintenance_fields(self):
        comp = _chain(km_at_service=0, km_threshold=2000, last_maintained_km=1900)
        result = _enrich_component(comp, current_km=1000, avg_km_per_day=None, maintenance_threshold=300)
        assert result["km_since_service"] == 1000
        assert result["pct_used"] == 50.0
