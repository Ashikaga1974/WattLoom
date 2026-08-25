"""Tests für backend/cache.py: der minimale In-Prozess-Cache für best_by_distance/heatmap."""
import backend.cache as cache


class TestGetOrSet:
    def test_computes_once_and_returns_cached_value_on_second_call(self):
        calls = []

        def compute():
            calls.append(1)
            return "value"

        first = cache.get_or_set("k", compute)
        second = cache.get_or_set("k", compute)

        assert first == "value"
        assert second == "value"
        assert len(calls) == 1  # zweiter Aufruf kam aus dem Cache, compute() nicht erneut ausgeführt

    def test_different_keys_are_computed_independently(self):
        assert cache.get_or_set("a", lambda: "A") == "A"
        assert cache.get_or_set("b", lambda: "B") == "B"


class TestInvalidate:
    def test_invalidate_without_prefix_clears_everything(self):
        cache.get_or_set("a", lambda: "A")
        cache.get_or_set("b", lambda: "B")
        cache.invalidate()

        calls = []
        cache.get_or_set("a", lambda: calls.append(1) or "A2")
        assert calls == [1]  # wurde neu berechnet, nicht aus dem (gelöschten) Cache

    def test_invalidate_with_prefix_only_clears_matching_keys(self):
        cache.get_or_set("heatmap:20:None", lambda: "H")
        cache.get_or_set("best_by_distance", lambda: "B")
        cache.invalidate("heatmap:")

        calls = []
        cache.get_or_set("heatmap:20:None", lambda: calls.append(1) or "H2")
        assert calls == [1]  # heatmap-Eintrag wurde verworfen

        calls_bbd = []
        cache.get_or_set("best_by_distance", lambda: calls_bbd.append(1) or "B2")
        assert calls_bbd == []  # best_by_distance war von 'heatmap:'-Prefix nicht betroffen
