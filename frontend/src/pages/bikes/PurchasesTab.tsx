import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type Purchase, type StorageLocation } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { fmtNum } from '@/lib/format';
import { componentLabel, PURCHASE_TYPE_OPTIONS } from './componentTypes';

const EMPTY_FORM = { name: '', shop: '', url: '', price: '', order_date: '', delivery_date: '', quantity: '1', notes: '', component_type: '', storage_location_id: '' };

export function PurchasesTab({ externalKey, onChanged }: { externalKey: number; onChanged: () => void }) {
  const { t } = useTranslation(['bikes', 'common']);
  const [items, setItems] = useState<Purchase[]>([]);
  const [bikeNames, setBikeNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [onlyStock, setOnlyStock] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lagerplätze (konfigurierbare Liste)
  const [locations, setLocations] = useState<StorageLocation[]>([]);
  const [manageLocationsOpen, setManageLocationsOpen] = useState(false);
  const [newLocationName, setNewLocationName] = useState('');
  const [editLocationId, setEditLocationId] = useState<number | null>(null);
  const [editLocationName, setEditLocationName] = useState('');
  const [locationError, setLocationError] = useState<string | null>(null);

  function reload() {
    api.listPurchases().then(setItems).finally(() => setLoading(false));
  }
  function reloadLocations() {
    api.listStorageLocations().then(setLocations);
  }
  useEffect(() => { reload(); }, [externalKey]);
  useEffect(() => {
    api.bikes().then(bikes => setBikeNames(Object.fromEntries(bikes.map(b => [b.id, b.name]))));
    reloadLocations();
  }, []);

  async function handleAddLocation() {
    const name = newLocationName.trim();
    if (!name) return;
    setLocationError(null);
    try {
      await api.addStorageLocation(name);
      setNewLocationName('');
      reloadLocations();
    } catch (e) {
      setLocationError(e instanceof Error ? e.message : t('purchases.locations.addFailed'));
    }
  }

  async function handleRenameLocation(id: number) {
    const name = editLocationName.trim();
    if (!name) return;
    setLocationError(null);
    try {
      await api.renameStorageLocation(id, name);
      setEditLocationId(null);
      reloadLocations();
      reload();
    } catch (e) {
      setLocationError(e instanceof Error ? e.message : t('purchases.locations.renameFailed'));
    }
  }

  async function handleDeleteLocation(id: number) {
    setLocationError(null);
    try {
      await api.deleteStorageLocation(id);
      reloadLocations();
      reload();
    } catch (e) {
      setLocationError(e instanceof Error ? e.message : t('purchases.locations.deleteFailed'));
    }
  }

  function openAdd() { setForm(EMPTY_FORM); setEditId(null); setAddOpen(true); }
  function openEdit(p: Purchase) {
    setForm({
      name: p.name, shop: p.shop ?? '', url: p.url ?? '',
      price: p.price != null ? String(p.price) : '',
      order_date: p.order_date ?? '', delivery_date: p.delivery_date ?? '',
      quantity: String(p.quantity), notes: p.notes ?? '',
      component_type: p.component_type ?? '',
      storage_location_id: p.storage_location_id != null ? String(p.storage_location_id) : '',
    });
    setEditId(p.id);
    setAddOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      const base = {
        name: form.name.trim(),
        shop: form.shop.trim() || null,
        url: form.url.trim() || null,
        price: form.price !== '' ? parseFloat(form.price) : null,
        order_date: form.order_date || null,
        delivery_date: form.delivery_date || null,
        notes: form.notes.trim() || null,
        component_type: form.component_type || null,
        storage_location_id: form.storage_location_id ? parseInt(form.storage_location_id) : null,
      };
      // Menge ist nur beim Anlegen editierbar (legt so viele purchase_items an) – beim
      // Bearbeiten einer bestehenden Bestellung läuft jede Mengenänderung über +/− in der Liste.
      if (editId !== null) await api.updatePurchase(editId, base);
      else await api.addPurchase({ ...base, quantity: parseInt(form.quantity) || 1 });
      setAddOpen(false);
      reload();
      onChanged();
    } finally { setBusy(false); }
  }

  async function handleAdjust(id: number, delta: number) {
    setBusy(true);
    try { await api.adjustPurchaseQuantity(id, delta); reload(); onChanged(); }
    finally { setBusy(false); }
  }

  async function handleDelete(id: number) {
    setBusy(true);
    setError(null);
    try {
      await api.deletePurchase(id);
      reload();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('purchases.deleteFailed'));
    } finally {
      setBusy(false);
    }
  }

  const displayed = onlyStock ? items.filter(p => p.quantity - p.installed_count > 0) : items;
  const stockCount = items.filter(p => p.quantity - p.installed_count > 0).length;

  const inputCls = "text-sm rounded border border-border bg-background px-2.5 py-1.5 focus:outline-none w-full";

  function fmtDate(iso: string | null) {
    if (!iso) return '—';
    return new Date(iso + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  if (loading) return <div className="h-32 animate-pulse rounded-xl bg-muted" />;

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-sm text-red-500 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2">
          {error}
        </p>
      )}

      {/* Kopfzeile */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">
            {t('purchases.stockCount', { count: stockCount })}
          </span>
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer select-none">
            <input type="checkbox" checked={onlyStock} onChange={e => setOnlyStock(e.target.checked)}
              className="accent-primary" />
            {t('purchases.onlyStock')}
          </label>
        </div>
        <button onClick={openAdd}
          className="text-sm px-3 py-1.5 rounded font-medium"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
          {t('purchases.addButton')}
        </button>
      </div>

      {/* Formular */}
      {addOpen && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              {editId !== null ? t('purchases.editTitle') : t('purchases.newTitle')}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="col-span-2 sm:col-span-2">
                <label className="text-sm text-muted-foreground">{t('purchases.fields.article')}</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder={t('purchases.fields.articlePlaceholder')} className={inputCls} />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">{t('purchases.fields.shop')}</label>
                <input value={form.shop} onChange={e => setForm(f => ({ ...f, shop: e.target.value }))}
                  placeholder={t('purchases.fields.shopPlaceholder')} className={inputCls} />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">{t('purchases.fields.componentType')}</label>
                <select value={form.component_type} onChange={e => setForm(f => ({ ...f, component_type: e.target.value }))}
                  className={inputCls} title={t('purchases.fields.componentTypeTitle')}>
                  <option value="">{t('purchases.fields.autoDetectOption')}</option>
                  {PURCHASE_TYPE_OPTIONS.map(code => (
                    <option key={code} value={code}>{componentLabel(code, t)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">{t('purchases.fields.storageLocation')}</label>
                <select value={form.storage_location_id} onChange={e => setForm(f => ({ ...f, storage_location_id: e.target.value }))}
                  className={inputCls}>
                  <option value="">{t('purchases.fields.noStorageLocationOption')}</option>
                  {locations.map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
                <button type="button" onClick={() => setManageLocationsOpen(o => !o)}
                  className="text-sm text-primary hover:underline mt-1">
                  {t('purchases.fields.manageLocationsButton')}
                </button>
              </div>
              <div className="col-span-2 sm:col-span-3">
                <label className="text-sm text-muted-foreground">{t('purchases.fields.link')}</label>
                <input type="url" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                  placeholder="https://..." className={inputCls} />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">{t('purchases.fields.price')}</label>
                <input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                  placeholder="0.00" min={0} step={0.01} className={inputCls} />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">{t('purchases.fields.quantity')}</label>
                {editId !== null ? (
                  <p className="text-sm text-muted-foreground px-2.5 py-1.5" title={t('purchases.fields.quantityLockedTitle')}>
                    {t('purchases.fields.quantityLockedNote')}
                  </p>
                ) : (
                  <input type="number" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                    min={1} className={inputCls} />
                )}
              </div>
              <div>
                <label className="text-sm text-muted-foreground">{t('purchases.fields.orderedAt')}</label>
                <input type="date" value={form.order_date} onChange={e => setForm(f => ({ ...f, order_date: e.target.value }))}
                  className={inputCls} />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">{t('purchases.fields.deliveredAt')}</label>
                <input type="date" value={form.delivery_date} onChange={e => setForm(f => ({ ...f, delivery_date: e.target.value }))}
                  className={inputCls} />
              </div>
              <div className="col-span-2 sm:col-span-3">
                <label className="text-sm text-muted-foreground">{t('purchases.fields.notes')}</label>
                <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder={t('purchases.fields.notesPlaceholder')} className={inputCls} />
              </div>
            </div>

            {manageLocationsOpen && (
              <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                <p className="text-sm font-medium">{t('purchases.locations.manageTitle')}</p>
                {locationError && <p className="text-sm text-red-500">{locationError}</p>}
                <div className="space-y-1.5">
                  {locations.map(l => (
                    <div key={l.id} className="flex items-center gap-2">
                      {editLocationId === l.id ? (
                        <>
                          <input value={editLocationName} onChange={e => setEditLocationName(e.target.value)}
                            className={inputCls} autoFocus />
                          <button onClick={() => handleRenameLocation(l.id)}
                            className="text-sm px-2 py-1 rounded border border-blue-400 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950">
                            ✓
                          </button>
                          <button onClick={() => setEditLocationId(null)}
                            className="text-sm px-2 py-1 rounded border border-border text-muted-foreground hover:bg-muted">
                            ✕
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="text-sm flex-1">{l.name}</span>
                          <button onClick={() => { setEditLocationId(l.id); setEditLocationName(l.name); }}
                            className="text-sm px-2 py-1 rounded border border-blue-400 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950">
                            ✎
                          </button>
                          <button onClick={() => handleDeleteLocation(l.id)}
                            className="text-sm px-2 py-1 rounded border border-red-300 text-red-500 hover:bg-red-50 dark:hover:bg-red-950">
                            {t('common:actions.delete')}
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                  {locations.length === 0 && (
                    <p className="text-sm text-muted-foreground">{t('purchases.locations.empty')}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <input value={newLocationName} onChange={e => setNewLocationName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddLocation()}
                    placeholder={t('purchases.locations.newPlaceholder')} className={inputCls} />
                  <button onClick={handleAddLocation} disabled={!newLocationName.trim()}
                    className="text-sm px-3 py-1.5 rounded font-medium disabled:opacity-40"
                    style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                    {t('purchases.locations.addButton')}
                  </button>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={handleSave} disabled={busy || !form.name.trim()}
                className="text-sm px-3 py-1 rounded font-medium disabled:opacity-40"
                style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                {t('common:actions.save')}
              </button>
              <button onClick={() => setAddOpen(false)}
                className="text-sm text-muted-foreground hover:underline">
                {t('common:actions.cancel')}
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabelle */}
      {displayed.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {onlyStock ? t('purchases.emptyOnlyStock') : t('purchases.emptyNone')}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-3 py-2 font-semibold text-muted-foreground">{t('purchases.table.article')}</th>
                <th className="text-left px-3 py-2 font-semibold text-muted-foreground">{t('purchases.table.type')}</th>
                <th className="text-left px-3 py-2 font-semibold text-muted-foreground">{t('purchases.table.storageLocation')}</th>
                <th className="text-left px-3 py-2 font-semibold text-muted-foreground">{t('purchases.table.shop')}</th>
                <th className="text-right px-3 py-2 font-semibold text-muted-foreground">{t('purchases.table.price')}</th>
                <th className="text-right px-3 py-2 font-semibold text-muted-foreground">{t('purchases.table.quantity')}</th>
                <th className="text-left px-3 py-2 font-semibold text-muted-foreground">{t('purchases.table.ordered')}</th>
                <th className="text-left px-3 py-2 font-semibold text-muted-foreground">{t('purchases.table.delivered')}</th>
                <th className="text-left px-3 py-2 font-semibold text-muted-foreground">{t('purchases.table.status')}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {displayed.map(p => {
                const inStock = p.quantity - p.installed_count;
                const depleted = inStock <= 0;
                return (
                  <tr key={p.id} className={`border-b border-border last:border-0 transition-colors hover:bg-muted/20${depleted ? ' bg-destructive/5' : ''}`}>
                    <td className="px-3 py-2">
                      <div className="font-medium">{p.name}</div>
                      {p.notes && <div className="text-sm text-muted-foreground">{p.notes}</div>}
                      {p.url && (
                        <a href={p.url} target="_blank" rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline">{t('purchases.orderLinkText')}</a>
                      )}
                      {p.returns.length > 0 && (
                        <div className="mt-0.5 space-y-0.5">
                          {p.returns.map(r => (
                            <div key={r.id} className="text-sm text-muted-foreground">
                              ↩ {r.km_ridden != null ? `${fmtNum(Math.round(r.km_ridden))} km` : '—'}
                              {r.bike_id ? ` · ${bikeNames[r.bike_id] ?? r.bike_id}` : ''}
                              {r.returned_at ? ` · ${fmtDate(r.returned_at)}` : ''}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{p.component_type ? componentLabel(p.component_type, t) : '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{p.storage_location_name ?? '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{p.shop ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {p.price != null ? `${fmtNum(p.price, 2)} €` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => handleAdjust(p.id, -1)} disabled={busy || p.quantity <= p.installed_count}
                          title={p.quantity <= p.installed_count
                            ? t('purchases.decreaseTitleDisabled', { count: p.installed_count })
                            : t('purchases.decreaseTitle')}
                          className="w-7 h-7 rounded border border-amber-400 text-amber-500 text-base font-bold text-center leading-none hover:bg-amber-50 dark:hover:bg-amber-950 disabled:opacity-30">−</button>
                        <span className={`font-semibold tabular-nums text-sm ${depleted ? 'text-destructive' : 'text-green-600'}`}>
                          {inStock}
                        </span>
                        <span className="text-muted-foreground text-sm">/ {p.quantity}</span>
                        <button onClick={() => handleAdjust(p.id, 1)} disabled={busy}
                          title={t('purchases.increaseTitle')}
                          className="w-7 h-7 rounded border border-blue-400 text-blue-500 text-base font-bold text-center leading-none hover:bg-blue-50 dark:hover:bg-blue-950 disabled:opacity-30">+</button>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{fmtDate(p.order_date)}</td>
                    <td className="px-3 py-2">
                      {p.delivery_date
                        ? <span className="text-muted-foreground">{fmtDate(p.delivery_date)}</span>
                        : <span className="text-amber-500 font-medium">{t('purchases.deliveryPending')}</span>
                      }
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-sm font-semibold ${depleted ? 'text-destructive' : 'text-green-600'}`}>
                        {depleted ? t('purchases.statusDepleted') : t('purchases.statusInStock', { count: inStock })}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => openEdit(p)} disabled={busy}
                          className="text-sm px-3 py-1.5 rounded-md border font-medium transition-colors disabled:opacity-40 border-blue-400 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950">
                          ✎ {t('common:actions.edit')}
                        </button>
                        <button onClick={() => handleDelete(p.id)} disabled={busy}
                          className="text-sm px-3 py-1.5 rounded-md border font-medium transition-colors disabled:opacity-40 border-red-300 text-red-500 hover:bg-red-50 dark:hover:bg-red-950">
                          {t('common:actions.delete')}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
