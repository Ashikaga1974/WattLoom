import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, type Bike, type SingleImportResult } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { rideTitle, workoutTitle } from '@/lib/activity-display';

export function TcxImportCard({ bikes }: { bikes: Bike[] }) {
  const { t } = useTranslation('common');
  const { t: ts } = useTranslation('settings');
  const navigate = useNavigate();
  const [tcxFile, setTcxFile] = useState<File | null>(null);
  const [tcxBikeId, setTcxBikeId] = useState('');
  const [tcxUploading, setTcxUploading] = useState(false);
  const [tcxResult, setTcxResult] = useState<SingleImportResult | null>(null);
  const [tcxError, setTcxError] = useState<string | null>(null);
  const tcxInputRef = useRef<HTMLInputElement>(null);
  const tcxBikePreselected = useRef(false);

  // Vorauswahl auf das erste Bike, sobald die Liste vom Elternteil geladen ist.
  // Nur einmalig – sonst überschreibt es eine bewusste "kein Rad"-Auswahl (tcxBikeId === '') sofort wieder.
  useEffect(() => {
    if (bikes.length > 0 && !tcxBikePreselected.current) {
      tcxBikePreselected.current = true;
      setTcxBikeId(bikes[0].id);
    }
  }, [bikes]);

  async function doTcxUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!tcxFile) return;
    setTcxUploading(true);
    setTcxResult(null);
    setTcxError(null);
    try {
      const res = await api.importTcxFile(tcxFile, tcxBikeId || undefined);
      setTcxResult(res);
      setTcxFile(null);
      if (tcxInputRef.current) tcxInputRef.current.value = '';
    } catch (err) {
      setTcxError(err instanceof Error ? err.message : ts('common.unknownError'));
    } finally {
      setTcxUploading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="border-b border-border pb-3">
        <CardTitle className="text-sm font-semibold">{ts('tcxImport.title')}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {ts('tcxImport.subtitle')}
        </p>
      </CardHeader>
      <CardContent className="pt-5">
        <form onSubmit={doTcxUpload} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Datei-Auswahl */}
            <div>
              <label className="block text-xs text-muted-foreground uppercase tracking-wider mb-2">
                {ts('tcxImport.fileLabel')}
              </label>
              <input
                ref={tcxInputRef}
                type="file"
                accept=".tcx"
                onChange={e => {
                  setTcxFile(e.target.files?.[0] ?? null);
                  setTcxResult(null);
                  setTcxError(null);
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
                value={tcxBikeId}
                onChange={e => setTcxBikeId(e.target.value)}
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
              disabled={!tcxFile || tcxUploading}
              className="rounded-md px-5 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-white cursor-pointer"
            >
              {tcxUploading ? ts('importCommon.importing') : ts('importCommon.importButton')}
            </button>

            {tcxResult && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-green-600">
                  Importiert: <span className="font-medium">{tcxResult.is_ride ? rideTitle(tcxResult, t) : workoutTitle(tcxResult, t)}</span>
                </span>
                {tcxResult.is_ride && (
                  <button
                    type="button"
                    onClick={() => navigate(`/activities/${tcxResult.activity_id}`)}
                    className="text-xs text-orange-500 hover:text-orange-400 underline underline-offset-2 transition-colors"
                  >
                    {ts('importCommon.openActivity')}
                  </button>
                )}
                {!tcxResult.is_ride && (
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

            {tcxError && (
              <span className="text-sm text-red-500">{tcxError}</span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
