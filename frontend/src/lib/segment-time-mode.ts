import { useState } from 'react';

export type SegmentTimeMode = 'elapsed' | 'moving';

const STORAGE_KEY = 'wattloom.segmentTimeMode';

function readStoredMode(): SegmentTimeMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'moving' ? 'moving' : 'elapsed';
  } catch {
    return 'elapsed';
  }
}

/**
 * Gesamtzeit/Fahrzeit-Wahl für Segmente, im Browser gemerkt – damit Übersicht und
 * Detailseite dieselbe Sicht zeigen und die Wahl einen Seitenwechsel überlebt.
 */
export function useSegmentTimeMode(): [SegmentTimeMode, (mode: SegmentTimeMode) => void] {
  const [mode, setMode] = useState<SegmentTimeMode>(readStoredMode);
  const update = (next: SegmentTimeMode) => {
    setMode(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* localStorage nicht verfügbar */ }
  };
  return [mode, update];
}
