import type { TFunction } from 'i18next';
import { fmtDateShort } from './format';

/**
 * Einzelimporte (FIT/TCX/GPX) komponieren seit der i18n-Umstellung keinen deutschen Namen
 * mehr direkt in der DB (siehe backend/importer/fit_single.py) – `name` ist dann `null` und
 * der Titel wird hier aus sport_type + Datum zusammengesetzt. ZIP-Importe (Strava) haben
 * weiterhin einen echten, von Strava übernommenen Namen und durchlaufen diesen Fallback nie.
 */

interface TitleableRide {
  name: string | null;
  start_date?: string;
  start_date_local?: string;
  date?: string;
}

export function rideTitle(a: TitleableRide, t: TFunction<'common'>): string {
  const dateStr = a.start_date ?? a.start_date_local ?? a.date ?? '';
  return a.name || `${t('sport.ride')} – ${fmtDateShort(dateStr)}`;
}

interface TitleableWorkout {
  name: string | null;
  sport_type: string;
  start_date_local?: string;
  date?: string;
}

export function workoutTitle(w: TitleableWorkout, t: TFunction<'common'>): string {
  const dateStr = w.start_date_local ?? w.date;
  const label = t(`sport.${w.sport_type}`, { defaultValue: w.sport_type });
  return w.name || (dateStr ? `${label} – ${fmtDateShort(dateStr)}` : label);
}
