import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type Bike, type Purchase } from '@/lib/api';
import { BikeCard } from './BikeCard';
import { PurchasesTab } from './PurchasesTab';

export function OverviewTab() {
  const { t } = useTranslation(['bikes', 'common']);
  const [bikes, setBikes] = useState<Bike[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [purchaseRefreshKey, setPurchaseRefreshKey] = useState(0);
  const [stockItems, setStockItems] = useState<Purchase[]>([]);
  const [editingName, setEditingName] = useState<{ bikeId: string; value: string } | null>(null);
  const [selectedInactiveId, setSelectedInactiveId] = useState<string | null>(null);

  function reload() { setRefreshKey(k => k + 1); }
  function reloadAll() { setRefreshKey(k => k + 1); setPurchaseRefreshKey(k => k + 1); }

  async function handleToggleRetired(bikeId: string) {
    await api.toggleBikeRetired(bikeId);
    if (bikeId === selectedInactiveId) setSelectedInactiveId(null);
    reload();
  }

  async function handleImageUpload(bikeId: string, file: File) {
    await api.uploadBikeImage(bikeId, file);
    reload();
  }

  async function handleSaveName(bikeId: string, name: string) {
    if (!name.trim()) { setEditingName(null); return; }
    await api.updateBike(bikeId, name.trim());
    setEditingName(null);
    reload();
  }

  useEffect(() => {
    setLoading(true);
    api.bikes()
      .then(setBikes)
      .catch(e => setError(e instanceof Error ? e.message : t('common:genericError')))
      .finally(() => setLoading(false));
    api.listPurchases().then(setStockItems).catch(() => {});
  }, [refreshKey]);

  if (error) {
    return <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>;
  }

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1].map(i => <div key={i} className="h-64 animate-pulse rounded-xl bg-muted" />)}
      </div>
    );
  }

  const activeBikes = bikes.filter(b => !b.retired);
  const inactiveBikes = bikes.filter(b => b.retired);
  const selectedInactiveBike = inactiveBikes.find(b => b.id === selectedInactiveId) ?? null;

  return (
    <>
    <div className="grid gap-4 md:grid-cols-2">
      {activeBikes.map(bike => (
        <BikeCard
          key={bike.id}
          bike={bike}
          stockItems={stockItems}
          editingName={editingName}
          onEditName={setEditingName}
          onSaveName={handleSaveName}
          onToggleRetired={handleToggleRetired}
          onImageUpload={handleImageUpload}
          onChanged={reload}
          onAdded={reloadAll}
          className={activeBikes.length === 1 ? 'md:col-span-2' : undefined}
        />
      ))}

      {bikes.length === 0 && (
        <p className="col-span-2 text-muted-foreground">{t('overview.noBikes')}</p>
      )}
    </div>

    <div className="mt-8 space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">{t('overview.purchasesHeading')}</h2>
      <PurchasesTab externalKey={purchaseRefreshKey} onChanged={reloadAll} />
    </div>

    {inactiveBikes.length > 0 && (
      <div className="mt-8 rounded-xl border border-border p-4 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-muted-foreground">{t('overview.inactiveBikesHeading')}</span>
          <select
            value={selectedInactiveId ?? ''}
            onChange={e => setSelectedInactiveId(e.target.value || null)}
            className="text-sm rounded-md border border-border bg-background px-2.5 py-1.5 focus:outline-none max-w-[240px]"
          >
            <option value="">{t('overview.selectBikePlaceholder')}</option>
            {inactiveBikes.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        {selectedInactiveBike && (
          <div>
            <BikeCard
              bike={selectedInactiveBike}
              stockItems={stockItems}
              editingName={editingName}
              onEditName={setEditingName}
              onSaveName={handleSaveName}
              onToggleRetired={handleToggleRetired}
              onImageUpload={handleImageUpload}
              onChanged={reload}
              onAdded={reloadAll}
            />
          </div>
        )}
      </div>
    )}
    </>
  );
}
