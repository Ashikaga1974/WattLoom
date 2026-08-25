import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, type Bike, type SingleImportResult } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { rideTitle, workoutTitle } from '@/lib/activity-display';

export function FitImportCard({ bikes }: { bikes: Bike[] }) {
  const { t } = useTranslation('common');
  const { t: ts } = useTranslation('settings');
  const navigate = useNavigate();
  const [fitFile, setFitFile] = useState<File | null>(null);
  const [fitBikeId, setFitBikeId] = useState('');
  const [fitUploading, setFitUploading] = useState(false);
  const [fitResult, setFitResult] = useState<SingleImportResult | null>(null);
  const [fitError, setFitError] = useState<string | null>(null);
  const fitInputRef = useRef<HTMLInputElement>(null);

  // Vorauswahl auf das erste Bike, sobald die Liste vom Elternteil geladen ist.
  useEffect(() => {
    if (bikes.length > 0 && fitBikeId === '') setFitBikeId(bikes[0].id);
  }, [bikes, fitBikeId]);

  async function doFitUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!fitFile) return;
    setFitUploading(true);
    setFitResult(null);
    setFitError(null);
    try {
      const res = await api.importFitFile(fitFile, fitBikeId || undefined);
      setFitResult(res);
      setFitFile(null);
      if (fitInputRef.current) fitInputRef.current.value = '';
    } catch (err) {
      setFitError(err instanceof Error ? err.message : ts('common.unknownError'));
    } finally {
      setFitUploading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="border-b border-border pb-3">
        <CardTitle className="text-sm font-semibold">{ts('fitImport.title')}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {ts('fitImport.subtitle')}
        </p>
      </CardHeader>
      <CardContent className="pt-5">
        <form onSubmit={doFitUpload} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Datei-Auswahl */}
            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                {ts('fitImport.fileLabel')}
              </label>
              <input
                ref={fitInputRef}
                type="file"
                accept=".fit"
                onChange={e => {
                  setFitFile(e.target.files?.[0] ?? null);
                  setFitResult(null);
                  setFitError(null);
                }}
                className="w-full text-sm text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-muted file:text-foreground hover:file:bg-muted/80 cursor-pointer"
              />
            </div>

            {/* Bike-Dropdown (optional – nur für Radtouren) */}
            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                {ts('importCommon.bikeLabel')} <span className="normal-case font-normal">{ts('importCommon.bikeOptionalHint')}</span>
              </label>
              <select
                value={fitBikeId}
                onChange={e => setFitBikeId(e.target.value)}
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
              disabled={!fitFile || fitUploading}
              className="rounded-md px-5 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-white cursor-pointer"
            >
              {fitUploading ? ts('importCommon.importing') : ts('importCommon.importButton')}
            </button>

            {fitResult && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-green-600">
                  Importiert: <span className="font-medium">{fitResult.is_ride ? rideTitle(fitResult, t) : workoutTitle(fitResult, t)}</span>
                </span>
                {fitResult.is_ride && (
                  <button
                    type="button"
                    onClick={() => navigate(`/activities/${fitResult.activity_id}`)}
                    className="text-xs text-orange-500 hover:text-orange-400 underline underline-offset-2 transition-colors"
                  >
                    {ts('importCommon.openActivity')}
                  </button>
                )}
              </div>
            )}

            {fitError && (
              <span className="text-sm text-red-500">{fitError}</span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
