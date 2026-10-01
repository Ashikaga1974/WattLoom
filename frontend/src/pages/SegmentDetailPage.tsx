import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, type SegmentDetail, type SegmentEffort, type TrackPoint } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { fmtDate, fmtTimeShort } from '@/lib/format';
import { useSegmentTimeMode } from '@/lib/segment-time-mode';
import { SegmentTimeModeToggle } from '@/components/SegmentTimeModeToggle';

const LeafletMap = lazy(() => import('@/components/LeafletMap'));

export default function SegmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const segmentId = Number(id);
  const { t } = useTranslation(['segments', 'common']);
  const navigate = useNavigate();

  const [segment, setSegment] = useState<SegmentDetail | null>(null);
  const [efforts, setEfforts] = useState<SegmentEffort[]>([]);
  // ID des zuletzt geladenen Segments – loading wird daraus abgeleitet statt synchron im Effect gesetzt
  const [loadedId, setLoadedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [timeMode, setTimeMode] = useSegmentTimeMode();

  useEffect(() => {
    if (!segmentId) return;
    // ignore verhindert, dass beim Segmentwechsel eine langsamere alte Antwort gewinnt
    let ignore = false;
    Promise.all([api.segment(segmentId), api.segmentEfforts(segmentId)])
      .then(([seg, effs]) => {
        if (ignore) return;
        setError(null);
        setSegment(seg);
        setEfforts(effs);
      })
      .catch(e => { if (!ignore) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!ignore) setLoadedId(segmentId); });
    return () => { ignore = true; };
  }, [segmentId]);
  const loading = loadedId !== segmentId;

  // Fahrzeit fehlt bei Efforts, die vor der Fahrzeit-Variante berechnet und noch nicht
  // neu abgeglichen wurden – dann auf die Gesamtzeit zurückfallen statt die Zeile zu verlieren
  const rankedEfforts = useMemo(() => {
    const view = efforts.map(e => ({
      ...e,
      shownTime: timeMode === 'moving' ? (e.moving_time_s ?? e.time_s) : e.time_s,
      shownSpeed: timeMode === 'moving' ? (e.moving_speed_kmh ?? e.avg_speed_kmh) : e.avg_speed_kmh,
    }));
    return view.sort((a, b) => a.shownTime - b.shownTime);
  }, [efforts, timeMode]);

  const mapPoints: TrackPoint[] = useMemo(() => {
    if (!segment) return [];
    return segment.points.map(p => ({
      lat: p.lat, lon: p.lon,
      altitude_m: null, distance_m: p.dist_m, speed_ms: null, hr: null, cadence: null, grade_pct: null,
    }));
  }, [segment]);

  async function handleDelete() {
    if (!segment) return;
    setDeleting(true);
    try {
      await api.deleteSegment(segment.id);
      navigate('/segments');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !segment) {
    return <p className="text-destructive text-sm">{error ?? t('notFound')}</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-1">
          <Link to="/segments" className="text-sm text-muted-foreground hover:text-primary transition-colors">
            ← {t('title')}
          </Link>
          {confirmDelete ? (
            <span className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{t('deleteConfirm')}</span>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-xs px-3 py-1 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/80 transition-colors disabled:opacity-50"
              >
                {deleting ? t('deleting') : t('common:actions.delete')}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs px-3 py-1 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
              >
                {t('common:actions.cancel')}
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-xs px-3 py-1 rounded-lg border border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors"
            >
              {t('common:actions.delete')}
            </button>
          )}
        </div>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{segment.name}</h1>
            <p className="text-sm text-muted-foreground mt-1">{(segment.distance_m / 1000).toFixed(2)} km</p>
          </div>
          <SegmentTimeModeToggle mode={timeMode} onChange={setTimeMode} />
        </div>
      </div>

      {mapPoints.length > 0 && (
        <Suspense fallback={<Skeleton className="h-80 w-full rounded-xl" />}>
          <LeafletMap points={mapPoints} fixedHeight={320} />
        </Suspense>
      )}

      <Card>
        <CardContent className="p-0">
          {efforts.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('noEfforts')}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-3 font-medium">{t('effortsTable.rank')}</th>
                  <th className="px-4 py-3 font-medium">{t('effortsTable.activity')}</th>
                  <th className="px-4 py-3 font-medium">{t('effortsTable.date')}</th>
                  <th className="px-4 py-3 font-medium text-right">{t('effortsTable.time')}</th>
                  <th className="px-4 py-3 font-medium text-right">{t('effortsTable.speed')}</th>
                  <th className="px-4 py-3 font-medium text-right">{t('effortsTable.hr')}</th>
                  <th className="px-4 py-3 font-medium text-right">{t('effortsTable.power')}</th>
                </tr>
              </thead>
              <tbody>
                {rankedEfforts.map((e, i) => (
                  <tr key={e.id} className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{i + 1}.</td>
                    <td className="px-4 py-3">
                      <Link to={`/activities/${e.activity_id}`} className="text-foreground hover:text-primary transition-colors">
                        {e.activity_name ?? `#${e.activity_id}`}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{e.activity_date ? fmtDate(e.activity_date) : '–'}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">{fmtTimeShort(e.shownTime)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{e.shownSpeed != null ? `${e.shownSpeed.toFixed(1)} km/h` : '–'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{e.avg_hr != null ? Math.round(e.avg_hr) : '–'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{e.avg_power_w != null ? `${Math.round(e.avg_power_w)} W` : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
