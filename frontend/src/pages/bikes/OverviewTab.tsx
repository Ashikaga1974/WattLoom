import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type Bike, type Purchase } from '@/lib/api';
import { EmptyState } from '@/components/ui/empty-state';
import { BikeCard } from './BikeCard';
import { MaintenanceQueue } from './MaintenanceQueue';

export function OverviewTab() {
  const { t } = useTranslation(['bikes', 'common']);
  const [bikes, setBikes] = useState<Bike[]>([]);
  // refreshKey der zuletzt geladenen Daten – loading wird daraus abgeleitet statt synchron im Effect gesetzt
  const [loadedKey, setLoadedKey] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [stockItems, setStockItems] = useState<Purchase[]>([]);
  const [editingName, setEditingName] = useState<{ bikeId: string; value: string } | null>(null);

  function reload() { setRefreshKey(k => k + 1); }

  async function handleToggleRetired(bikeId: string) {
    await api.toggleBikeRetired(bikeId);
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
    api.bikes()
      .then(setBikes)
      .catch(e => setError(e instanceof Error ? e.message : t('common:genericError')))
      .finally(() => setLoadedKey(refreshKey));
    api.listPurchases().then(setStockItems).catch(() => {});
  }, [refreshKey]);
  const loading = loadedKey !== refreshKey;

  if (error) {
    return <EmptyState message={error} />;
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

  return (
    <>
    {activeBikes.length > 0 && (
      <div className="mb-6">
        <MaintenanceQueue bikes={activeBikes} />
      </div>
    )}

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
          onAdded={reload}
          className={activeBikes.length === 1 ? 'md:col-span-2' : undefined}
        />
      ))}

      {bikes.length === 0 && (
        <p className="col-span-2 text-muted-foreground">{t('overview.noBikes')}</p>
      )}
    </div>

    {inactiveBikes.length > 0 && (
      <div className="mt-8 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">{t('overview.inactiveBikesHeading')}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {inactiveBikes.map(bike => (
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
              onAdded={reload}
              className={inactiveBikes.length === 1 ? 'md:col-span-2' : undefined}
            />
          ))}
        </div>
      </div>
    )}
    </>
  );
}
