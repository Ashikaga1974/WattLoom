import { createContext, useContext } from 'react';

export type ThemeChoice = 'light' | 'dark' | 'system';

export interface ThemeContextValue {
  theme: ThemeChoice;
  setTheme: (choice: ThemeChoice) => void;
}

// Provider liegt in ThemeProvider.tsx – Fast Refresh verlangt, dass .tsx-Dateien nur Komponenten exportieren.
export const ThemeContext = createContext<ThemeContextValue>({
  theme: 'system',
  setTheme: () => {},
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
