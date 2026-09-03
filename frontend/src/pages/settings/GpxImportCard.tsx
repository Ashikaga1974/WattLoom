import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, type Bike, type SingleImportResult } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { rideTitle, workoutTitle } from '@/lib/activity-display';

export function GpxImportCard({ bikes }: { bikes: Bike[] }) {
  const { t } = useTranslation('common');
  const { t: ts } = useTranslation('settings');
  const navigate = useNavigate();
  const [gpxFile, setGpxFile] = useState<File | null>(null);
  const [gpxBikeId, setGpxBikeId] = useState('');
  const [gpxUploading, setGpxUploading] = useState(false);
  const [gpxResult, setGpxResult] = useState<SingleImportResult | null>(null);
  const [gpxError, setGpxError] = useState<string | null>(null);
  const gpxInputRef = useRef<HTMLInputElement>(null);
  const gpxBikePreselected = useRef(false);

  // Vorauswahl auf das erste Bike, sobald die Liste vom Elternteil geladen ist.
  // Nur einmalig – sonst überschreibt es eine bewusste "kein Rad"-Auswahl (gpxBikeId === '') sofort wieder.
  useEffect(() => {
    if (bikes.length > 0 && !gpxBikePreselected.current) {
      gpxBikePreselected.current = true;
      setGpxBikeId(bikes[0].id);
    }
  }, [bikes]);

  async function doGpxUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!gpxFile) return;
    setGpxUploading(true);
    setGpxResult(null);
    setGpxError(null);
    try {
      const res = await api.importGpxFile(gpxFile, gpxBikeId || undefined);
      setGpxResult(res);
      setGpxFile(null);
      if (gpxInputRef.current) gpxInputRef.current.value = '';
    } catch (err) {
      setGpxError(err instanceof Error ? err.message : ts('common.unknownError'));
    } finally {
      setGpxUploading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="border-b border-border pb-3">
        <CardTitle className="text-sm font-semibold">{ts('gpxImport.title')}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {ts('gpxImport.subtitle')}
        </p>
      </CardHeader>
      <CardContent className="pt-5">
        <form onSubmit={doGpxUpload} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                {ts('gpxImport.fileLabel')}
              </label>
              <input
                ref={gpxInputRef}
                type="file"
                accept=".gpx"
                onChange={e => {
                  setGpxFile(e.target.files?.[0] ?? null);
                  setGpxResult(null);
                  setGpxError(null);
                }}
                className="w-full text-sm text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-muted file:text-foreground hover:file:bg-muted/80 cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                {ts('importCommon.bikeLabel')} <span className="normal-case font-normal">{ts('importCommon.bikeOptionalHint')}</span>
              </label>
              <select
                value={gpxBikeId}
                onChange={e => setGpxBikeId(e.target.value)}
                className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-colors"
              >
                <option value="">{ts('importCommon.noBikeOption')}</option>
                {bikes.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <button
              type="submit"
              disabled={!gpxFile || gpxUploading}
              className="rounded-md px-5 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-white cursor-pointer"
            >
              {gpxUploading ? ts('importCommon.importing') : ts('importCommon.importButton')}
            </button>

            {gpxResult && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-green-600">
                  Importiert: <span className="font-medium">{gpxResult.is_ride ? rideTitle(gpxResult, t) : workoutTitle(gpxResult, t)}</span>
                </span>
                {gpxResult.is_ride && (
                  <button
                    type="button"
                    onClick={() => navigate(`/activities/${gpxResult.activity_id}`)}
                    className="text-xs text-orange-500 hover:text-orange-400 underline underline-offset-2 transition-colors"
                  >
                    {ts('importCommon.openActivity')}
                  </button>
                )}
                {!gpxResult.is_ride && (
                  <button
                    type="button"
                    onClick={() => navigate('/activities?tab=workouts')}
                    className="text-xs text-orange-500 hover:text-orange-400 underline underline-offset-2 transition-colors"
                  >
                    {ts('importCommon.openWorkouts')}
                  </button>
                )}
              </div>
            )}

            {gpxError && (
              <span className="text-sm text-red-500">{gpxError}</span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
