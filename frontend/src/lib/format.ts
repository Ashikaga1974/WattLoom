/** Meter → km mit einer Nachkommastelle */
export function fmtKm(m: number): string {
  return (m / 1000).toFixed(1);
}

/** m/s → km/h mit einer Nachkommastelle */
export function fmtSpeed(ms: number): string {
  return (ms * 3.6).toFixed(1);
}

/** Sekunden → h:mm */
export function fmtTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}h` : `${m}min`;
}

/** Sekunden → mm:ss (für kurze Zeiten) */
export function fmtTimeShort(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/** m/s → min/km Pace */
export function fmtPace(ms: number): string {
  if (ms <= 0) return '--';
  const secPerKm = 1000 / ms;
  const min = Math.floor(secPerKm / 60);
  const sec = Math.floor(secPerKm % 60);
  return `${min}:${String(sec).padStart(2, '0')} /km`;
}

/** ISO-Datum → lesbares Datum (z.B. "17.06.2023") */
export function fmtDate(dateStr: string): string {
  const d = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** ISO-Datum → Kurzdatum (z.B. "17.06.23") */
export function fmtDateShort(dateStr: string): string {
  const d = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

/** ISO-Datum → Wochentag-Kürzel (z.B. "Mo.") */
export function fmtWeekday(dateStr: string): string {
  const d = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
  return d.toLocaleDateString('de-DE', { weekday: 'short' });
}

/** ISO-Datum → Uhrzeit (z.B. "08:45") */
export function fmtClock(dateStr: string): string {
  const d = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

/** Zahl mit Tausender-Trennzeichen */
export function fmtNum(n: number, decimals = 0): string {
  return n.toLocaleString('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Höhenmeter formatiert (z.B. "1.234 m") */
export function fmtElevation(m: number | null): string {
  if (m === null) return '--';
  return `${fmtNum(Math.round(m))} m`;
}

/** Sekunden → "1h 23m 45s" / "23m 45s" (für Aktivitäts-Detailseite) */
export function fmtHm(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m ${sec}s`;
}
