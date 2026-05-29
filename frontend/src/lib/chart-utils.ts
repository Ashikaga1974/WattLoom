import { BEZIER_TENSION } from './config';
const T = BEZIER_TENSION;
const f = (n: number) => n.toFixed(1);

type Pt = [number, number];

// Glatte Linie durch eine lückenlose Punktfolge
export function smoothLine(pts: Pt[]): string {
	if (pts.length < 2) return '';
	if (pts.length === 2)
		return `M${f(pts[0][0])},${f(pts[0][1])}L${f(pts[1][0])},${f(pts[1][1])}`;

	let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
	for (let i = 0; i < pts.length - 1; i++) {
		const p0 = pts[Math.max(0, i - 1)];
		const p1 = pts[i];
		const p2 = pts[i + 1];
		const p3 = pts[Math.min(pts.length - 1, i + 2)];
		const cp1x = p1[0] + (p2[0] - p0[0]) * T;
		const cp1y = p1[1] + (p2[1] - p0[1]) * T;
		const cp2x = p2[0] - (p3[0] - p1[0]) * T;
		const cp2y = p2[1] - (p3[1] - p1[1]) * T;
		d += `C${f(cp1x)},${f(cp1y)} ${f(cp2x)},${f(cp2y)} ${f(p2[0])},${f(p2[1])}`;
	}
	return d;
}

// Glatte Fläche: smoothe Oberkante, gerade Unterkante
export function smoothArea(pts: Pt[], bottomY: number): string {
	if (pts.length < 2) return '';
	const lx = f(pts[pts.length - 1][0]);
	const fx = f(pts[0][0]);
	const by = f(bottomY);
	return `${smoothLine(pts)}L${lx},${by}L${fx},${by}Z`;
}

// Glatte Linie mit Lücken (null-Werte → neues M)
export function smoothLineWithGaps(
	values: (number | null)[],
	xOf: (i: number) => number,
	yOf: (v: number) => number,
): string {
	let d = '';
	let segment: Pt[] = [];

	function flush() {
		if (segment.length >= 2) d += smoothLine(segment);
		else if (segment.length === 1) {
			// Einzelpunkt: kleines Kreuz wäre schöner, aber wir überspringen ihn
		}
		segment = [];
	}

	for (let i = 0; i < values.length; i++) {
		const v = values[i];
		if (v == null || v <= 0) {
			flush();
		} else {
			segment.push([xOf(i), yOf(v)]);
		}
	}
	flush();
	return d;
}
