import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Bike } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function BikesPage() {
  const [bikes, setBikes] = useState<Bike[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.bikes()
      .then(setBikes)
      .catch(e => setError(e instanceof Error ? e.message : 'Fehler'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader title="Bikes" />

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1].map(i => (
            <div key={i} className="h-40 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {bikes.map(bike => (
              <Card key={bike.id} className="shadow-sm">
                <CardContent className="p-6 flex flex-col gap-4">
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-xl font-bold">{bike.name}</h2>
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
                    {bike.retired ? (
                      <Badge variant="secondary">Ausgemustert</Badge>
                    ) : (
                      <Badge className="bg-primary/10 text-primary border-primary/20">Aktiv</Badge>
                    )}
                  </div>

                  {/* Kennzahlen */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-muted/60 px-4 py-3">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Rides</p>
                      <p className="mt-0.5 text-2xl font-bold text-primary">{bike.ride_count}</p>
                    </div>
                    <div className="rounded-lg bg-muted/60 px-4 py-3">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Aktivitäten</p>
                      <p className="mt-0.5 text-2xl font-bold">{bike.ride_count} <span className="text-sm font-normal text-muted-foreground">Rides</span></p>
                    </div>
                  </div>

                  {/* Links */}
                  <div className="flex items-center gap-4 mt-auto">
                    <Link
                      to={`/activities?bike=${bike.id}`}
                      className="text-sm text-primary hover:underline"
                    >
                      Alle Aktivitäten →
                    </Link>
                    <Link
                      to="/bikes/compare"
                      className="text-sm text-muted-foreground hover:text-primary transition-colors"
                    >
                      Vergleich
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}

            {bikes.length === 0 && (
              <p className="col-span-2 text-muted-foreground">Keine Bikes gefunden.</p>
            )}
          </div>

          {/* Vergleich-Link */}
          {bikes.length >= 2 && (
            <div className="text-center">
              <Link
                to="/bikes/compare"
                className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
              >
                Bikes vergleichen →
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
