// Theme-System: 4 Themes, gespeichert in localStorage, gesetzt als data-theme auf <html>

export type Theme = 'dark' | 'light' | 'midnight' | 'warm' | 'ocean';

export interface ThemeDefinition {
	id: Theme;
	label: string;
	color: string; // Vorschau-Hex für den Swatch
}

export const THEMES: ThemeDefinition[] = [
	{ id: 'dark',     label: 'Dark',     color: '#1a1a22' },
	{ id: 'light',    label: 'Light',    color: '#e8e8eb' },
	{ id: 'midnight', label: 'Midnight', color: '#0e1428' },
	{ id: 'warm',     label: 'Warm',     color: '#241c14' },
	{ id: 'ocean',    label: 'Ocean',    color: '#0e1e30' },
];

const STORAGE_KEY = 'mybiking-theme';

// Svelte 5 Runes Pattern: reaktiver State als Objekt mit Methoden
function createThemeStore() {
	let current = $state<Theme>('dark');

	return {
		get current() {
			return current;
		},

		// Theme anwenden: setzt data-theme auf <html> und speichert in localStorage
		apply(theme: Theme) {
			current = theme;
			if (typeof document !== 'undefined') {
				document.documentElement.setAttribute('data-theme', theme);
				localStorage.setItem(STORAGE_KEY, theme);
			}
		},

		// Beim App-Start aufrufen (nur in onMount, nicht auf dem Server)
		init() {
			const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
			const theme: Theme = saved && THEMES.some(t => t.id === saved) ? saved : 'midnight';
			this.apply(theme);
		},
	};
}

export const themeStore = createThemeStore();
