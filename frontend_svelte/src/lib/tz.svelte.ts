import { api } from './api';

function createTzStore() {
	let offset = $state<number | null>(null);

	return {
		get offset() { return offset; },
		async load() {
			try {
				const s = await api.getSettings();
				offset = s.tz_offset ?? null;
			} catch {}
		}
	};
}

export const tzStore = createTzStore();

function asUtc(utcStr: string): Date {
	return new Date(utcStr + (utcStr.endsWith('Z') ? '' : 'Z'));
}

function shifted(utcStr: string, tzOffset: number): Date {
	return new Date(asUtc(utcStr).getTime() + tzOffset * 3_600_000);
}

export function fmtDate(utcStr: string, tzOffset: number | null): string {
	if (tzOffset === null) {
		return asUtc(utcStr).toLocaleDateString('de-DE', {
			day: '2-digit', month: '2-digit', year: 'numeric'
		});
	}
	const d = shifted(utcStr, tzOffset);
	return [
		d.getUTCDate().toString().padStart(2, '0'),
		(d.getUTCMonth() + 1).toString().padStart(2, '0'),
		d.getUTCFullYear(),
	].join('.');
}

export function fmtDateLong(utcStr: string, tzOffset: number | null): string {
	if (tzOffset === null) {
		return asUtc(utcStr).toLocaleDateString('de-DE', {
			weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
		});
	}
	return shifted(utcStr, tzOffset).toLocaleDateString('de-DE', {
		weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
		timeZone: 'UTC'
	});
}

export function fmtTime(utcStr: string, tzOffset: number | null): string {
	if (tzOffset === null) {
		return asUtc(utcStr).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
	}
	const d = shifted(utcStr, tzOffset);
	return `${d.getUTCHours().toString().padStart(2, '0')}:${d.getUTCMinutes().toString().padStart(2, '0')}`;
}

// YYYY-MM-DD in lokaler Zeit – für Kalender-Tagzuweisung
export function dateKey(utcStr: string, tzOffset: number | null): string {
	if (tzOffset === null) {
		return asUtc(utcStr).toLocaleDateString('sv-SE');
	}
	return shifted(utcStr, tzOffset).toISOString().slice(0, 10);
}

// Effektiven Offset für Backend-Queries – Auto nutzt Browser-Timezone
export function effectiveTzOffset(tzOffset: number | null): number {
	if (tzOffset !== null) return tzOffset;
	return -new Date().getTimezoneOffset() / 60;
}
