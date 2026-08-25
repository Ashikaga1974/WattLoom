import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type Purchase } from '@/lib/api';
import { fmtNum } from '@/lib/format';
import { componentLabel, COMPONENT_TYPES, detectAnyBase, resolvePositionalBase } from './componentTypes';

export function AddComponentForm({
  bikeId, stockItems, onAdded,
}: {
  bikeId: string;
  stockItems: Purchase[];
  onAdded: () => void;
}) {
  const { t } = useTranslation(['bikes', 'common']);
  const [open, setOpen] = useState(false);
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<number | ''>('');
  const [selectedType, setSelectedType] = useState(COMPONENT_TYPES[0].type);
  const [threshold, setThreshold] = useState(COMPONENT_TYPES[0].threshold);
  const [position, setPosition] = useState<'front' | 'rear'>('front');
  const [installedAt, setInstalledAt] = useState(new Date().toISOString().slice(0, 10));
  const [carryOverReturnId, setCarryOverReturnId] = useState<number | ''>('');
  const [busy, setBusy] = useState(false);

  const available = stockItems.filter(p => p.quantity - p.installed_count > 0);
  const selectedPurchase = available.find(p => p.id === selectedPurchaseId) ?? null;

  const detectedBase = selectedPurchase ? resolvePositionalBase(selectedPurchase) : null;
  const isPositional = detectedBase !== null;
  const effectiveType = isPositional ? `${detectedBase}_${position}` : selectedType;

  // Rückläufer dieses Einkaufs (Vorbelastung übernehmbar) – Backend liefert hier immer nur noch
  // nicht wiedereingebaute (offene) Rückgaben, da ein wiedereingebauter Eintrag gelöscht statt
  // markiert wird. Es kann mehrere gleichzeitig geben (z.B. mehrere gebrauchte Exemplare mit
  // unterschiedlichem km-Stand neben einem frisch gekauften), daher Auswahl statt Checkbox.
  const openReturns = selectedPurchase
    ? [...selectedPurchase.returns].sort((a, b) => (a.returned_at ?? '').localeCompare(b.returned_at ?? ''))
    : [];

  function handlePurchaseChange(val: string) {
    const id = val === '' ? '' : Number(val);
    setSelectedPurchaseId(id);
    setCarryOverReturnId('');
    if (id === '') return;
    const p = available.find(x => x.id === id);
    if (!p) return;
    const base = resolvePositionalBase(p);
    if (base) {
      // Positional: threshold aus dem front-Typ lesen
      const def = COMPONENT_TYPES.find(c => c.type === `${base}_front`);
      if (def) setThreshold(def.threshold);
    } else if (p.component_type) {
      // Expliziter, nicht-positionaler Typ am Einkauf hinterlegt
      const def = COMPONENT_TYPES.find(c => c.type === p.component_type);
      if (def) { setSelectedType(def.type); setThreshold(def.threshold); }
    } else {
      // Kein expliziter Typ: ersten zum Namen passenden Typ vorauswählen
      const matchedCode = detectAnyBase(p.name);
      const match = matchedCode ? COMPONENT_TYPES.find(c => c.type === matchedCode) : undefined;
      if (match) { setSelectedType(match.type); setThreshold(match.threshold); }
    }
  }

  function handleTypeChange(newType: string) {
    setSelectedType(newType);
    const def = COMPONENT_TYPES.find(c => c.type === newType);
    if (def) setThreshold(def.threshold);
  }

  async function handleAdd() {
    if (selectedPurchaseId === '') return;
    setBusy(true);
    try {
      await api.addBikeComponent(bikeId, {
        type: effectiveType,
        km_threshold: threshold,
        installed_at: installedAt,
        purchase_id: selectedPurchaseId as number,
        return_id: carryOverReturnId === '' ? undefined : carryOverReturnId,
      });
      setOpen(false);
      setSelectedPurchaseId('');
      setPosition('front');
      setCarryOverReturnId('');
      onAdded();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        disabled={available.length === 0}
        className="w-full text-sm font-medium py-2.5 rounded-xl border border-dashed border-border text-primary hover:bg-primary/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title={available.length === 0 ? t('addForm.noStockTitle') : undefined}
      >
        {t('addForm.closedButton')}
      </button>
    );
  }

  const fieldCls = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary";
  const labelCls = "space-y-1 text-sm text-muted-foreground";

  return (
    <div className="rounded-xl border p-4 space-y-4" style={{ borderColor: 'var(--primary)' }}>
      <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t('addForm.panelTitle')}</p>
      <label className={labelCls}>
        <span className="block">{t('fields.stockItem')}</span>
        <select
          value={selectedPurchaseId}
          onChange={e => handlePurchaseChange(e.target.value)}
          className={fieldCls}
        >
          <option value="">{t('fields.noStockItemOption')}</option>
          {available.map(p => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.quantity - p.installed_count}x)
            </option>
          ))}
        </select>
      </label>

      {selectedPurchaseId !== '' && (
        <div className="grid grid-cols-2 gap-3">
          <label className={labelCls}>
            <span className="block">{t('fields.type')}</span>
            {isPositional ? (
              // Vorne/Hinten-Toggle für Schlauch, Mantel etc.
              <div className="flex rounded-md overflow-hidden border border-border">
                {(['front', 'rear'] as const).map(pos => (
                  <button
                    key={pos}
                    onClick={() => setPosition(pos)}
                    className={`flex-1 py-1.5 text-sm font-medium transition-colors ${
                      position === pos
                        ? 'text-white'
                        : 'text-muted-foreground hover:bg-muted'
                    }`}
                    style={position === pos ? { background: 'var(--primary)' } : {}}
                  >
                    {t(`common:position.${pos}`)}
                  </button>
                ))}
              </div>
            ) : (
              <select
                value={selectedType}
                onChange={e => handleTypeChange(e.target.value)}
                className={fieldCls}
              >
                {COMPONENT_TYPES.map(c => (
                  <option key={c.type} value={c.type}>{componentLabel(c.type, t)}</option>
                ))}
              </select>
            )}
          </label>
          <label className={labelCls}>
            <span className="block">{t('fields.maintenanceInterval')}</span>
            <input
              type="number"
              value={threshold}
              onChange={e => setThreshold(Number(e.target.value))}
              className={`${fieldCls} tabular-nums`}
              min={100}
              step={100}
            />
          </label>
          <label className={labelCls}>
            <span className="block">{t('fields.installDate')}</span>
            <input
              type="date"
              value={installedAt}
              onChange={e => setInstalledAt(e.target.value)}
              className={fieldCls}
            />
          </label>
        </div>
      )}
      {openReturns.length > 0 && (
        <label className={labelCls}>
          <span className="block">{t('addForm.carryOverLabel')}</span>
          <select
            value={carryOverReturnId}
            onChange={e => setCarryOverReturnId(e.target.value === '' ? '' : Number(e.target.value))}
            className={fieldCls}
          >
            <option value="">{t('addForm.noCarryOverOption')}</option>
            {openReturns.map(r => (
              <option key={r.id} value={r.id}>
                {fmtNum(Math.round(r.km_ridden ?? 0))} km
                {r.returned_at ? t('addForm.carryOverReturnedSuffix', { date: new Date(r.returned_at + 'T00:00:00').toLocaleDateString('de-DE') }) : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleAdd}
          disabled={busy || selectedPurchaseId === ''}
          className="text-sm px-4 py-1.5 rounded-md font-medium disabled:opacity-40"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
        >
          {t('addForm.install')}{isPositional && selectedPurchaseId !== '' ? ` (${componentLabel(effectiveType, t)})` : ''}
        </button>
        <button onClick={() => setOpen(false)} className="text-sm px-4 py-1.5 rounded-md border border-border text-muted-foreground hover:bg-muted">
          {t('common:actions.cancel')}
        </button>
      </div>
    </div>
  );
}
