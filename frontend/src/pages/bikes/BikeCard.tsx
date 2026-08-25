import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, type Bike, type Purchase } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { fmtNum } from '@/lib/format';
import { ComponentRow } from './ComponentRow';
import { AddComponentForm } from './AddComponentForm';

export function BikeCard({
  bike, stockItems, editingName, onEditName, onSaveName, onToggleRetired, onImageUpload, onChanged, onAdded, className,
}: {
  bike: Bike;
  stockItems: Purchase[];
  editingName: { bikeId: string; value: string } | null;
  onEditName: (v: { bikeId: string; value: string } | null) => void;
  onSaveName: (bikeId: string, name: string) => void;
  onToggleRetired: (bikeId: string) => void;
  onImageUpload: (bikeId: string, file: File) => void;
  onChanged: () => void;
  onAdded: () => void;
  className?: string;
}) {
  const { t } = useTranslation(['bikes', 'common']);
  return (
    <Card className={`shadow-sm overflow-hidden${className ? ` ${className}` : ''}`}>
      <CardContent className="p-4 flex flex-col gap-3">
        {/* Kopfzeile: Titel + Thumbnail + Toggle */}
        <div className="flex items-start gap-3">
          {/* Bike-Thumbnail */}
          <div className="relative shrink-0 w-20 h-16 rounded-lg overflow-hidden bg-muted/40">
            {bike.image_filename ? (
              <img
                src={api.bikeImageUrl(bike.id)}
                alt={bike.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <span className="text-2xl opacity-20 select-none">🚴</span>
              </div>
            )}
            {/* Foto-Upload-Button */}
            <label className="absolute inset-0 flex items-end justify-center cursor-pointer opacity-0 hover:opacity-100 transition-opacity bg-black/30">
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) onImageUpload(bike.id, f);
                  e.target.value = '';
                }}
              />
              <span className="text-sm px-1.5 py-0.5 mb-1 rounded bg-black/70 text-white">
                {bike.image_filename ? t('bikeCard.changeImage') : t('bikeCard.uploadImage')}
              </span>
            </label>
          </div>

          {/* Name + Meta + Toggle */}
          <div className="flex-1 min-w-0 flex items-start justify-between gap-3">
            <div className="min-w-0">
              {editingName?.bikeId === bike.id ? (
                <input
                  autoFocus
                  value={editingName.value}
                  onChange={e => onEditName({ bikeId: bike.id, value: e.target.value })}
                  onBlur={() => onSaveName(bike.id, editingName.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') onSaveName(bike.id, editingName.value);
                    if (e.key === 'Escape') onEditName(null);
                  }}
                  className="text-lg font-bold w-full rounded border border-primary bg-background px-1 focus:outline-none"
                />
              ) : (
                <h2
                  className="text-lg font-bold truncate cursor-pointer hover:text-primary transition-colors"
                  title={t('bikeCard.editNameTitle')}
                  onClick={() => onEditName({ bikeId: bike.id, value: bike.name })}
                >
                  {bike.name}
                </h2>
              )}
              {(bike.brand || bike.model) &&
                `${bike.brand ?? ''} ${bike.model ?? ''}`.trim() !== bike.name && (
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {[bike.brand, bike.model].filter(Boolean).join(' ')}
                  </p>
                )}
              {bike.description && (
                <p className="mt-1 text-sm text-muted-foreground">{bike.description}</p>
              )}
            </div>
            {/* Aktiv/Inaktiv-Toggle */}
            <button
              onClick={() => onToggleRetired(bike.id)}
              className="shrink-0 text-sm px-3 py-1.5 rounded-full font-semibold transition-all border"
              style={bike.retired
                ? { background: 'var(--muted)', color: 'var(--muted-foreground)', borderColor: 'var(--border)' }
                : { background: 'rgba(34,197,94,0.1)', color: '#22c55e', borderColor: 'rgba(34,197,94,0.3)' }
              }
              title={t('bikeCard.toggleTitle')}
            >
              {bike.retired ? t('status.inactive') : t('status.active')}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-lg bg-muted/60 px-3 py-2 flex items-baseline justify-between gap-2">
            <span className="text-sm uppercase tracking-wider text-muted-foreground">{t('bikeCard.statRides')}</span>
            <span className="text-xl font-bold text-primary">{bike.ride_count}</span>
          </div>
          <div className="rounded-lg bg-muted/60 px-3 py-2 flex items-baseline justify-between gap-2">
            <span className="text-sm uppercase tracking-wider text-muted-foreground">{t('bikeCard.statTotalKm')}</span>
            <span className="text-xl font-bold">{fmtNum(Math.round(bike.current_km))}</span>
          </div>
        </div>

        {/* Verschleiß */}
        <div className="border-t border-border pt-3 space-y-1.5">
          <p className="text-sm font-semibold">{t('bikeCard.wearTitle')}</p>
          {bike.components.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('bikeCard.noComponents')}</p>
          )}
          {bike.components.map(comp => (
            <ComponentRow key={comp.id} comp={comp} bikeId={bike.id} stockItems={stockItems} onChanged={onChanged} />
          ))}
          <AddComponentForm bikeId={bike.id} stockItems={stockItems} onAdded={onAdded} />
        </div>

        <Link
          to={`/activities?bike=${bike.id}`}
          className="w-full text-center text-sm font-medium py-2 rounded-xl border border-border text-primary hover:bg-primary/5 transition-colors mt-auto"
        >
          {t('bikeCard.allActivitiesLink')}
        </Link>
      </CardContent>
    </Card>
  );
}
