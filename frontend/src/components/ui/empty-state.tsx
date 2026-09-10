import type { ReactNode } from 'react';

interface EmptyStateProps {
  message: ReactNode;
}

// Einheitlicher "Keine Daten"/Fehler-Zustand für Analyse-Seiten (Vorbild: Tempoentwicklung).
export function EmptyState({ message }: EmptyStateProps) {
  return (
    <div className="rounded border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">
      {message}
    </div>
  );
}
