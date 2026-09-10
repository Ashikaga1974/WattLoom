import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';

export function AddBikeForm({ onAdded }: { onAdded: () => void }) {
  const { t } = useTranslation(['bikes', 'common']);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.createBike(name.trim());
      setName('');
      setOpen(false);
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common:genericError'));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full text-sm font-medium py-2.5 rounded-xl border border-dashed border-border text-primary hover:bg-primary/5 transition-colors"
      >
        {t('addBikeForm.closedButton')}
      </button>
    );
  }

  return (
    <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: 'var(--primary)' }}>
      <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t('addBikeForm.panelTitle')}</p>
      <label className="space-y-1 text-sm text-muted-foreground block">
        <span className="block">{t('addBikeForm.nameLabel')}</span>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
          className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          autoFocus
        />
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleAdd}
          disabled={busy || !name.trim()}
          className="text-sm px-4 py-1.5 rounded-md font-medium disabled:opacity-40"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
        >
          {t('addBikeForm.create')}
        </button>
        <button onClick={() => setOpen(false)} className="text-sm px-4 py-1.5 rounded-md border border-border text-muted-foreground hover:bg-muted">
          {t('common:actions.cancel')}
        </button>
      </div>
    </div>
  );
}
