import type { MouseEvent } from 'react';
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
  const activeComponents = bike.components.filter(c => !c.retired_at);
  const criticalCount = activeComponents.filter(c => (c.pct_used ?? 0) >= 80).length;
  const sortedComponents = [...bike.components].sort((a, b) => (b.pct_used ?? 0) - (a.pct_used ?? 0));

  // stopPropagation nötig, da <summary> jeden Klick innerhalb als Toggle behandelt – auch auf
  // verschachtelten Buttons/Inputs (Bildupload, Namens-Edit, Aktiv-Toggle sollen nicht mit auf-/zuklappen)
  function stop(e: MouseEvent) { e.stopPropagation(); }

  return (
    <Card className={`overflow-hidden${bike.retired ? ' opacity-70 shadow-sm' : ' shadow-lg ring-2 ring-foreground/20'}${className ? ` ${className}` : ''}`}>
      <details id={`bike-${bike.id}`} className="group">
        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <CardContent className="p-4 flex items-center gap-3">
            {/* Bike-Thumbnail */}
            <div className="relative shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-muted/40" onClick={stop}>
              {bike.image_filename ? (
                <img
                  src={api.bikeImageUrl(bike.id)}
                  alt={bike.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <span className="text-xl opacity-20 select-none">🚴</span>
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

            {/* Name + Stats */}
            <div className="flex-1 min-w-0" onClick={stop}>
              <div className="flex items-center gap-2 flex-wrap">
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
                    className="text-base font-bold rounded border border-primary bg-background px-1 focus:outline-none"
                  />
                ) : (
                  <h2
                    className="text-base font-bold truncate cursor-pointer hover:text-primary-strong transition-colors"
                    title={t('bikeCard.editNameTitle')}
                    onClick={() => onEditName({ bikeId: bike.id, value: bike.name })}
                  >
                    {bike.name}
                  </h2>
                )}
                <button
                  onClick={() => onToggleRetired(bike.id)}
                  className="shrink-0 text-sm px-2.5 py-0.5 rounded-full font-semibold transition-all border"
                  style={bike.retired
                    ? { background: 'var(--muted)', color: 'var(--muted-foreground)', borderColor: 'var(--border)' }
                    : { background: 'rgba(34,197,94,0.1)', color: '#22c55e', borderColor: 'rgba(34,197,94,0.3)' }
                  }
                  title={t('bikeCard.toggleTitle')}
                >
                  {bike.retired ? t('status.inactive') : t('status.active')}
                </button>
              </div>
              <p className="text-sm text-muted-foreground tabular-nums">
                {bike.ride_count} {t('bikeCard.statRides')} · {fmtNum(Math.round(bike.current_km))} {t('bikeCard.statTotalKm')}
              </p>
            </div>

            {/* Status-Chip + Auf-/Zuklapp-Pfeil */}
            <span
              className="shrink-0 flex items-center gap-1.5 text-sm font-semibold px-2.5 py-1 rounded-lg"
              style={criticalCount > 0
                ? { background: 'rgba(249,115,22,0.12)', color: '#f97316' }
                : { background: 'rgba(34,197,94,0.1)', color: '#22c55e' }
              }
            >
              {criticalCount > 0 && <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#f97316' }} />}
              {criticalCount > 0 ? t('bikeCard.statusCritical', { count: criticalCount }) : t('bikeCard.statusOk')}
              <span className="text-sm transition-transform group-open:rotate-180">▾</span>
            </span>
          </CardContent>
        </summary>

        <CardContent className="px-4 pb-4 pt-0 flex flex-col gap-3">
          {/* Verschleiß */}
          <div className="border-t border-border pt-1 divide-y divide-border">
            {bike.components.length === 0 && (
              <p className="py-2 text-sm text-muted-foreground">{t('bikeCard.noComponents')}</p>
            )}
            {sortedComponents.map(comp => (
              <ComponentRow key={comp.id} comp={comp} bikeId={bike.id} stockItems={stockItems} onChanged={onChanged} />
            ))}
          </div>
          <AddComponentForm bikeId={bike.id} stockItems={stockItems} onAdded={onAdded} />
        </CardContent>
      </details>
    </Card>
  );
}
