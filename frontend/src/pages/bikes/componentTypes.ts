import type { TFunction } from 'i18next';
import type { Purchase } from '@/lib/api';

// Übersetzt einen Komponenten-Typ-Code (chain, tire_front, …) fürs Anzeigen. Unbekannte/
// freihändig gepflegte Alt-Werte (nicht per Migration erkannt) fallen auf den Rohwert zurück.
export function componentLabel(code: string, t: TFunction<'common'>): string {
  return t(`common:component.${code}`, { defaultValue: code });
}

// Codes statt deutscher Literale (siehe backend/database.py-Migration, die bestehende Zeilen
// auf dieselben Codes umstellt) – Anzeige über componentLabel()/t('component.<code>').
export const COMPONENT_TYPES: { type: string; threshold: number }[] = [
  { type: 'chain',      threshold: 2000  },
  { type: 'cassette',   threshold: 8000  },
  { type: 'tire_front', threshold: 5000  },
  { type: 'tire_rear',  threshold: 5000  },
  { type: 'tube_front', threshold: 5000  },
  { type: 'tube_rear',  threshold: 5000  },
  { type: 'brake_pads', threshold: 5000  },
  { type: 'cable',      threshold: 10000 },
  { type: 'derailleur', threshold: 20000 },
  { type: 'other',      threshold: 5000  },
];

// Stichwörter (DE+EN) zur Namens-Erkennung von Einkäufen ohne expliziten component_type
// (z.B. "Fincci Bicycle Tyre 700X23C") – unabhängig von den Anzeige-Codes oben, da ein
// deutscher oder fremdsprachiger Artikelname nie die Codes selbst enthält.
const BASE_KEYWORDS: Record<string, string> = {
  kette: 'chain', chain: 'chain',
  kassette: 'cassette', cassette: 'cassette',
  mantel: 'tire', reifen: 'tire', tire: 'tire', tyre: 'tire',
  schlauch: 'tube', tube: 'tube',
  bremsbelag: 'brake_pads', bremsbeläge: 'brake_pads', 'brake pad': 'brake_pads',
  kabel: 'cable', cable: 'cable',
  schaltwerk: 'derailleur', derailleur: 'derailleur',
};

export function wearColor(pct: number): string {
  if (pct >= 100) return '#ef4444';
  if (pct >= 80)  return '#f97316';
  if (pct >= 60)  return '#f59e0b';
  return '#22c55e';
}

// Typen die es in front/rear-Varianten gibt
export const POSITIONAL_BASES = Array.from(new Set(
  COMPONENT_TYPES
    .filter(c => /_(front|rear)$/.test(c.type))
    .map(c => c.type.replace(/_(front|rear)$/, ''))
    .filter(base =>
      COMPONENT_TYPES.some(c => c.type === `${base}_front`) &&
      COMPONENT_TYPES.some(c => c.type === `${base}_rear`)
    )
));

// Basis-Typen für die Typ-Zuordnung bei Einkäufen (Front/Rear-Varianten zusammengefasst)
export const PURCHASE_TYPE_OPTIONS = Array.from(new Set(
  COMPONENT_TYPES.map(c => c.type.replace(/_(front|rear)$/, ''))
));

// Nur unter den positionalen Basen (tire, tube, …) suchen – für den Vorne/Hinten-Toggle
function detectBase(purchaseName: string): string | null {
  const lower = purchaseName.toLowerCase();
  const code = Object.entries(BASE_KEYWORDS).find(([kw]) => lower.includes(kw))?.[1] ?? null;
  return code && POSITIONAL_BASES.includes(code) ? code : null;
}

// Über alle Basis-Typen suchen – Fallback für nicht-positionale Typen ohne expliziten
// component_type (z.B. "Kette" im Namen)
export function detectAnyBase(purchaseName: string): string | null {
  const lower = purchaseName.toLowerCase();
  return Object.entries(BASE_KEYWORDS).find(([kw]) => lower.includes(kw))?.[1] ?? null;
}

// Positional-Basis eines Einkaufs ermitteln: expliziter Typ hat Vorrang vor Namens-Erkennung
// (wichtig für fremdsprachige/uneindeutige Artikelnamen wie "Fincci Bicycle Tyre 700X23C")
export function resolvePositionalBase(p: Purchase): string | null {
  if (p.component_type) return POSITIONAL_BASES.includes(p.component_type) ? p.component_type : null;
  return detectBase(p.name);
}
