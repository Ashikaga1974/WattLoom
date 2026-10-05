import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type BikeComponent, type Purchase } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { fmtNum } from '@/lib/format';
import { useConfig } from '@/lib/config-context';
import { componentLabel, COMPONENT_TYPES, wearColor } from './componentTypes';

export function ComponentRow({
  comp,
  bikeId,
  stockItems,
  onChanged,
}: {
  comp: BikeComponent;
  bikeId: string;
  stockItems: Purchase[];
  onChanged: () => void;
}) {
  const { t } = useTranslation(['bikes', 'common']);
  const { chain_maintenance_km } = useConfig();
  const pct = comp.pct_used ?? 0;
  const color = wearColor(pct);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [uninstalling, setUninstalling] = useState(false);
  const [uninstallKm, setUninstallKm] = useState(Math.round(comp.km_since_service));
  const [uninstallPurchaseId, setUninstallPurchaseId] = useState('');
  const [linking, setLinking] = useState(false);
  const [linkPurchaseId, setLinkPurchaseId] = useState('');
  const [newStockName, setNewStockName] = useState('');
  const [maintaining, setMaintaining] = useState(false);
  const [maintainDate, setMaintainDate] = useState(new Date().toISOString().slice(0, 10));
  const [menuOpen, setMenuOpen] = useState(false);

  // Nur relevant für Altbestand ohne bestehenden Lagerbezug (Übergang zum Einkaufs-Lager)
  const availableStock = stockItems.filter(p => p.quantity - p.installed_count > 0);
  const returnsToStock = comp.purchase_item_id != null || uninstallPurchaseId !== '';

  // Legt bei Bedarf einen neuen Lagerartikel an und liefert dessen ID. quantity: 0 – das Item
  // für diese eine Komponente wird direkt danach vom aufrufenden Uninstall-/Link-Endpunkt
  // angelegt (der immer ein neues Item erzeugt); mit quantity: 1 hier gäbe es sonst 2 Items.
  async function resolvePurchaseId(selected: string): Promise<number | undefined> {
    if (selected === '') return undefined;
    if (selected === '__new__') {
      if (!newStockName.trim()) return undefined;
      const created = await api.addPurchase({
        name: newStockName.trim(), shop: null, url: null, price: null,
        order_date: null, delivery_date: null, quantity: 0, notes: null,
        component_type: comp.type.replace(/_(front|rear)$/, ''),
        storage_location_id: null,
      });
      return created.id;
    }
    return Number(selected);
  }

  // Edit-State
  const [editType, setEditType] = useState(comp.type);
  const [editThreshold, setEditThreshold] = useState(comp.km_threshold ?? 2000);
  const [editDate, setEditDate] = useState(comp.added_at ?? new Date().toISOString().slice(0, 10));

  function openEdit() {
    setEditType(comp.type);
    setEditThreshold(comp.km_threshold ?? 2000);
    setEditDate(comp.added_at ?? new Date().toISOString().slice(0, 10));
    setEditing(true);
  }

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      await api.updateBikeComponent(bikeId, comp.id, {
        type: editType,
        km_threshold: editThreshold,
        installed_at: editDate,
      });
      setEditing(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('componentRow.actionFailed'));
    } finally {
      setBusy(false);
    }
  }
  async function handleUninstall() {
    setBusy(true);
    setError(null);
    try {
      const pid = await resolvePurchaseId(uninstallPurchaseId);
      await api.uninstallBikeComponent(bikeId, comp.id, uninstallKm, pid);
      setUninstalling(false);
      setUninstallPurchaseId('');
      setNewStockName('');
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('componentRow.actionFailed'));
    } finally { setBusy(false); }
  }
  async function handleLinkToStock() {
    if (linkPurchaseId === '') return;
    setBusy(true);
    setError(null);
    try {
      const pid = await resolvePurchaseId(linkPurchaseId);
      if (pid == null) return;
      // Bereits ausgebaute Komponente: verknüpfen + zurücklegen. Noch verbaute Komponente
      // (aktiv oder inaktiv, aber nicht ausgebaut): nur nachträglich verknüpfen, bleibt verbaut.
      if (comp.uninstalled_km != null) await api.returnComponentToStock(bikeId, comp.id, pid);
      else await api.linkComponentPurchase(bikeId, comp.id, pid);
      setLinking(false);
      setLinkPurchaseId('');
      setNewStockName('');
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('componentRow.actionFailed'));
    } finally { setBusy(false); }
  }
  async function handleDelete() {
    setBusy(true);
    setError(null);
    try { await api.deleteBikeComponent(bikeId, comp.id); onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : t('componentRow.actionFailed')); }
    finally { setBusy(false); }
  }
  async function handleMaintain() {
    setBusy(true);
    setError(null);
    try {
      await api.maintainBikeComponent(bikeId, comp.id, maintainDate);
      setMaintaining(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('componentRow.actionFailed'));
    } finally { setBusy(false); }
  }

  const installedLabel = comp.added_at
    ? new Date(comp.added_at + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null;

  const fieldCls = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary";
  const labelCls = "space-y-1 text-sm text-muted-foreground";

  if (editing) {
    return (
      <div className="rounded-xl border p-4 space-y-4" style={{ borderColor: 'var(--primary-strong)' }}>
        <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t('componentRow.editTitle')}</p>
        <div className="grid grid-cols-2 gap-3">
          <label className={labelCls}>
            <span className="block">{t('fields.type')}</span>
            <select value={editType} onChange={e => setEditType(e.target.value)} className={fieldCls}>
              {COMPONENT_TYPES.map(c => <option key={c.type} value={c.type}>{componentLabel(c.type, t)}</option>)}
            </select>
          </label>
          <label className={labelCls}>
            <span className="block">{t('fields.maintenanceInterval')}</span>
            <input type="number" value={editThreshold} onChange={e => setEditThreshold(Number(e.target.value))}
              className={fieldCls} min={100} step={100} />
          </label>
          <label className={labelCls}>
            <span className="block">{t('fields.installDate')}</span>
            <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className={fieldCls} />
          </label>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={handleSave} disabled={busy}
            className="text-sm px-4 py-1.5 rounded-md font-medium disabled:opacity-40"
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
            {t('actions.save')}
          </button>
          <button onClick={() => setEditing(false)}
            className="text-sm px-4 py-1.5 rounded-md border border-border text-muted-foreground hover:bg-muted">
            {t('actions.cancel')}
          </button>
        </div>
      </div>
    );
  }

  const isRetired = !!comp.retired_at;
  const actionBtn = "text-sm px-3 py-1.5 rounded-md border font-medium transition-colors disabled:opacity-40";
  const panelFieldCls = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500";

  // Ketten-Pflege ist nur dann eine eigene, sichtbare Zeile wert, wenn sie tatsächlich ansteht –
  // sonst bläht sie die Komponentenliste unnötig auf (jede Kette hätte sonst dauerhaft einen
  // zweiten Balken + Button). Solange sie nicht fällig ist, reicht ein kleiner Inline-Hinweis.
  const maintenancePct = comp.maintenance_pct_used;
  const maintenanceDue = maintenancePct != null && maintenancePct >= 80;

  return (
    <div className={`py-2 first:pt-0${isRetired ? ' opacity-60' : ''}`}>
      {error && (
        <p className="mb-1.5 text-sm text-red-500 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2">
          {error}
        </p>
      )}

      {/* Titel + Metadaten */}
      <div className="flex items-center gap-x-2.5 gap-y-1 min-w-0 flex-wrap">
        <span className="text-sm font-semibold truncate">{componentLabel(comp.type, t)}</span>
        {isRetired && <Badge variant="secondary">{t('status.inactive')}</Badge>}
        {comp.purchase_name && (
          <span className="text-sm text-muted-foreground" title={t('componentRow.linkedPurchaseTitle')}>
            📦 {comp.purchase_name}
          </span>
        )}
        {comp.purchase_url && (
          <a href={comp.purchase_url} target="_blank" rel="noopener noreferrer"
            className="text-sm text-primary-strong hover:underline" title={t('componentRow.orderLinkTitle')}>
            {t('componentRow.orderLinkText')}
          </a>
        )}
        {installedLabel && <span className="text-sm text-muted-foreground">{t('componentRow.since', { date: installedLabel })}</span>}
        {isRetired && comp.uninstalled_km != null && (
          <span className="text-sm text-muted-foreground">{t('componentRow.uninstalledAfter', { km: fmtNum(Math.round(comp.uninstalled_km)) })}</span>
        )}
        {!isRetired && maintenancePct != null && (
          <span className="text-sm" style={{ color: maintenanceDue ? wearColor(maintenancePct) : 'var(--muted-foreground)' }}>
            · {t('componentRow.maintenanceLabel')} {Math.round(maintenancePct)}%
          </span>
        )}
      </div>

      {/* Balken + km/Fälligkeit + Aktionen in einer Zeile */}
      <div className="mt-1 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground tabular-nums">
            <span>{fmtNum(Math.round(comp.km_since_service))} / {fmtNum(comp.km_threshold ?? 0)} km</span>
            {pct >= 100
              ? <span className="font-semibold" style={{ color }}>· {t('componentRow.maintenanceDue')}</span>
              : comp.estimated_service_date && (
                <span>· {t('componentRow.estimatedDate', { date: new Date(comp.estimated_service_date + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) })}</span>
              )}
          </div>
        </div>

        <span className="text-sm font-bold tabular-nums shrink-0" style={{ color }}>
          {Math.round(pct)}%
        </span>

        <div className="flex items-center gap-1.5 shrink-0">
          {!isRetired && (
            <button onClick={() => { setUninstallKm(Math.round(comp.km_since_service)); setUninstalling(v => !v); }} disabled={busy}
              className={`${actionBtn} border-border text-foreground hover:bg-muted`}
              title={t('componentRow.uninstallButtonTitle')}>
              {t('componentRow.uninstallButton')}
            </button>
          )}
          {isRetired && comp.uninstalled_km != null && comp.purchase_item_id == null && (
            <button onClick={() => setLinking(v => !v)} disabled={busy}
              className={`${actionBtn} border-border text-foreground hover:bg-muted`}
              title={t('componentRow.toStockButtonTitle')}>
              {t('componentRow.toStockButton')}
            </button>
          )}
          {maintenanceDue && (
            <button onClick={() => { setMaintainDate(new Date().toISOString().slice(0, 10)); setMaintaining(v => !v); }} disabled={busy}
              className={`${actionBtn} border-emerald-400 text-emerald-600 dark:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950`}
              title={t('componentRow.maintenanceButtonTitle')}>
              🧴 {t('componentRow.maintenanceButton')}
            </button>
          )}
          <div className="relative">
            <button onClick={() => setMenuOpen(v => !v)} disabled={busy}
              className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
              aria-label={t('componentRow.moreActions')} title={t('componentRow.moreActions')}>
              ⋮
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-20 min-w-[170px] rounded-lg border border-border bg-popover shadow-md p-1">
                  <button onClick={() => { openEdit(); setMenuOpen(false); }}
                    className="w-full text-left text-sm px-2.5 py-1.5 rounded-md hover:bg-muted">
                    ✎ {t('common:actions.edit')}
                  </button>
                  {!isRetired && maintenancePct != null && !maintenanceDue && (
                    <button onClick={() => { setMaintainDate(new Date().toISOString().slice(0, 10)); setMaintaining(true); setMenuOpen(false); }}
                      className="w-full text-left text-sm px-2.5 py-1.5 rounded-md hover:bg-muted"
                      title={t('componentRow.maintenanceButtonTitle')}>
                      🧴 {t('componentRow.maintenanceButton')}
                    </button>
                  )}
                  {comp.uninstalled_km == null && comp.purchase_item_id == null && (
                    <button onClick={() => { setLinking(true); setMenuOpen(false); }}
                      className="w-full text-left text-sm px-2.5 py-1.5 rounded-md hover:bg-muted"
                      title={t('componentRow.linkButtonTitle')}>
                      {t('componentRow.linkButton')}
                    </button>
                  )}
                  <hr className="my-1 border-border" />
                  <button onClick={() => { handleDelete(); setMenuOpen(false); }}
                    className="w-full text-left text-sm px-2.5 py-1.5 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
                    title={t('componentRow.deleteButtonTitle')}>
                    {t('common:actions.delete')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Ketten-Pflege-Panel: nur bei tatsächlicher Fälligkeit oder aktivem Formular sichtbar */}
      {!isRetired && maintenancePct != null && (maintenanceDue || maintaining) && (
        <div className="mt-1.5 flex items-center gap-2 text-sm text-muted-foreground">
          <span className="tabular-nums">
            {fmtNum(Math.round(comp.km_since_maintenance ?? 0))} / {fmtNum(chain_maintenance_km)} km ·{' '}
            {comp.last_maintained_at
              ? t('componentRow.lastMaintained', { date: new Date(comp.last_maintained_at + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) })
              : t('componentRow.neverMaintained')}
          </span>
        </div>
      )}
      {maintaining && (
        <div className="mt-1.5 flex flex-wrap items-end gap-2 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/30 p-2.5">
          <label className={labelCls}>
            <span className="block">{t('componentRow.maintenanceDateLabel')}</span>
            <input type="date" value={maintainDate} onChange={e => setMaintainDate(e.target.value)}
              max={new Date().toISOString().slice(0, 10)} className={fieldCls} />
          </label>
          <button onClick={handleMaintain} disabled={busy}
            className={`${actionBtn} border-emerald-400 text-emerald-600 dark:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950`}>
            {t('common:actions.save')}
          </button>
          <button onClick={() => setMaintaining(false)} disabled={busy}
            className={`${actionBtn} border-border text-muted-foreground hover:bg-muted`}>
            {t('common:actions.cancel')}
          </button>
        </div>
      )}

      {/* Ausbauen-Panel */}
      {uninstalling && (
        <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/30 p-3 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1">
              <span className="block text-sm text-muted-foreground">{t('componentRow.kmRiddenLabel')}</span>
              <input
                type="number"
                value={uninstallKm}
                onChange={e => setUninstallKm(Number(e.target.value))}
                className={`${panelFieldCls} w-28 tabular-nums`}
                min={0}
              />
            </label>
            {comp.purchase_item_id == null && (
              <label className="space-y-1 flex-1 min-w-[200px]">
                <span className="block text-sm text-muted-foreground">{t('componentRow.stockRefLabel')}</span>
                <select
                  value={uninstallPurchaseId}
                  onChange={e => setUninstallPurchaseId(e.target.value)}
                  className={panelFieldCls}
                  title={t('componentRow.stockRefTitle')}
                >
                  <option value="">{t('componentRow.noStockRefOption')}</option>
                  {availableStock.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.quantity - p.installed_count}x)
                    </option>
                  ))}
                  <option value="__new__">{t('fields.createNewStockOption')}</option>
                </select>
              </label>
            )}
            {uninstallPurchaseId === '__new__' && (
              <label className="space-y-1 flex-1 min-w-[160px]">
                <span className="block text-sm text-muted-foreground">{t('fields.newItemName')}</span>
                <input
                  type="text"
                  value={newStockName}
                  onChange={e => setNewStockName(e.target.value)}
                  placeholder={t('fields.newItemNamePlaceholder')}
                  className={panelFieldCls}
                />
              </label>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={handleUninstall} disabled={busy || (uninstallPurchaseId === '__new__' && !newStockName.trim())}
              className="text-sm px-4 py-1.5 rounded-md font-medium border border-amber-400 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 disabled:opacity-40">
              {returnsToStock ? t('componentRow.confirmAndStock') : t('componentRow.confirm')}
            </button>
            <button onClick={() => { setUninstalling(false); setUninstallPurchaseId(''); setNewStockName(''); }}
              className="text-sm text-muted-foreground hover:underline">
              {t('common:actions.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Nachträglich mit Einkauf verknüpfen (verbaut) bzw. ins Lager zurücklegen (ausgebaut) */}
      {linking && (
        <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/30 p-3 space-y-3">
          <p className="text-sm text-muted-foreground">
            {comp.uninstalled_km != null
              ? t('componentRow.linkDescReturned')
              : t('componentRow.linkDescStillInstalled')}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1 flex-1 min-w-[200px]">
              <span className="block text-sm text-muted-foreground">{t('fields.stockItem')}</span>
              <select
                value={linkPurchaseId}
                onChange={e => setLinkPurchaseId(e.target.value)}
                className={panelFieldCls}
              >
                <option value="">{t('fields.noStockItemOption')}</option>
                {availableStock.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.quantity - p.installed_count}x)
                  </option>
                ))}
                <option value="__new__">{t('fields.createNewStockOption')}</option>
              </select>
            </label>
            {linkPurchaseId === '__new__' && (
              <label className="space-y-1 flex-1 min-w-[160px]">
                <span className="block text-sm text-muted-foreground">{t('fields.newItemName')}</span>
                <input
                  type="text"
                  value={newStockName}
                  onChange={e => setNewStockName(e.target.value)}
                  placeholder={t('fields.newItemNamePlaceholder')}
                  className={panelFieldCls}
                />
              </label>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={handleLinkToStock} disabled={busy || linkPurchaseId === '' || (linkPurchaseId === '__new__' && !newStockName.trim())}
              className="text-sm px-4 py-1.5 rounded-md font-medium border border-amber-400 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 disabled:opacity-40">
              {t('componentRow.confirm')}
            </button>
            <button onClick={() => { setLinking(false); setLinkPurchaseId(''); setNewStockName(''); }}
              className="text-sm text-muted-foreground hover:underline">
              {t('common:actions.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
