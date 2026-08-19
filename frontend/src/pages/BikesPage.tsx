import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, type Bike, type BikeCompareData, type BikeComponent, type DeletedComponent, type Purchase } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { fmtNum } from '@/lib/format';

// ─── Vergleich-Hilfsfunktionen ────────────────────────────────────────────────

const BIKE_COLORS = ['#3b82f6', '#f97316'];
function bikeColor(idx: number) { return BIKE_COLORS[idx % BIKE_COLORS.length]; }

const BINS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const BIN_LABELS = ['0–10', '10–20', '20–30', '30–40', '40–50', '50–60', '60–70', '70–80', '80–90', '90–100', '100+'];

function buildHistogram(dists: number[]): number[] {
  const counts = new Array(BINS.length).fill(0);
  for (const d of dists) {
    const idx = BINS.findIndex((b, i) => d >= b && (i === BINS.length - 1 || d < BINS[i + 1]));
    if (idx >= 0) counts[idx]++;
  }
  return counts;
}

function yTicks(maxVal: number, steps = 5): number[] {
  const step = Math.ceil(maxVal / steps / 5) * 5 || 5;
  const ticks: number[] = [];
  for (let v = 0; v <= maxVal; v += step) ticks.push(v);
  return ticks;
}

const ROWS = [
  { label: 'Rides',             key: 'rides',             fmt: (v: number) => fmtNum(v),    unit: '' },
  { label: 'Gesamt km',         key: 'total_km',          fmt: (v: number) => fmtNum(v, 1), unit: ' km' },
  { label: 'Gesamt Höhenmeter', key: 'total_elevation_m', fmt: (v: number) => fmtNum(v),    unit: ' m' },
  { label: 'Gesamt Stunden',    key: 'total_hours',       fmt: (v: number) => fmtNum(v, 1), unit: ' h' },
  { label: 'Ø Distanz',         key: 'avg_dist_km',       fmt: (v: number) => fmtNum(v, 1), unit: ' km' },
  { label: 'Ø Geschwindigkeit', key: 'avg_speed_kmh',     fmt: (v: number) => fmtNum(v, 1), unit: ' km/h' },
  { label: 'Ø Höhenmeter/Ride', key: 'avg_elevation_m',   fmt: (v: number) => fmtNum(v),    unit: ' m' },
  { label: 'Unterhaltskosten',  key: 'total_cost',        fmt: (v: number) => fmtNum(v, 2), unit: ' €' },
  { label: 'Kosten/100 km',     key: 'cost_per_100km',    fmt: (v: number | null) => fmtNum(v ?? 0, 2), unit: ' €' },
];

// ─── Verschleiß-Hilfsfunktionen ──────────────────────────────────────────────

const COMPONENT_TYPES: { type: string; threshold: number }[] = [
  { type: 'Kette',         threshold: 2000  },
  { type: 'Kassette',      threshold: 8000  },
  { type: 'Mantel vorne',   threshold: 5000  },
  { type: 'Mantel hinten',  threshold: 5000  },
  { type: 'Schlauch vorne', threshold: 5000  },
  { type: 'Schlauch hinten',threshold: 5000  },
  { type: 'Bremsbeläge',   threshold: 5000  },
  { type: 'Kabel',         threshold: 10000 },
  { type: 'Schaltwerk',    threshold: 20000 },
  { type: 'Sonstiges',     threshold: 5000  },
];

function wearColor(pct: number): string {
  if (pct >= 100) return '#ef4444';
  if (pct >= 80)  return '#f97316';
  if (pct >= 60)  return '#f59e0b';
  return '#22c55e';
}

function ComponentRow({
  comp,
  bikeId,
  stockItems,
  onChanged,
}: {
  comp: BikeComponent;
  bikeId: string;
  stockItems: Purchase[];
  onChanged: () => void;
}) {
  const pct = comp.pct_used ?? 0;
  const color = wearColor(pct);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [uninstalling, setUninstalling] = useState(false);
  const [uninstallKm, setUninstallKm] = useState(Math.round(comp.km_since_service));
  const [uninstallPurchaseId, setUninstallPurchaseId] = useState('');
  const [linking, setLinking] = useState(false);
  const [linkPurchaseId, setLinkPurchaseId] = useState('');
  const [newStockName, setNewStockName] = useState('');

  // Nur relevant für Altbestand ohne bestehenden Lagerbezug (Übergang zum Einkaufs-Lager)
  const availableStock = stockItems.filter(p => p.quantity - p.installed_count > 0);
  const returnsToStock = comp.purchase_item_id != null || uninstallPurchaseId !== '';

  // Legt bei Bedarf einen neuen Lagerartikel an und liefert dessen ID. quantity: 0 – das Item
  // für diese eine Komponente wird direkt danach vom aufrufenden Uninstall-/Link-Endpunkt
  // angelegt (der immer ein neues Item erzeugt); mit quantity: 1 hier gäbe es sonst 2 Items.
  async function resolvePurchaseId(selected: string): Promise<number | undefined> {
    if (selected === '') return undefined;
    if (selected === '__new__') {
      if (!newStockName.trim()) return undefined;
      const created = await api.addPurchase({
        name: newStockName.trim(), shop: null, url: null, price: null,
        order_date: null, delivery_date: null, quantity: 0, notes: null,
        component_type: comp.type.replace(/ (vorne|hinten)$/, ''),
      });
      return created.id;
    }
    return Number(selected);
  }

  // Edit-State
  const [editType, setEditType] = useState(comp.type);
  const [editThreshold, setEditThreshold] = useState(comp.km_threshold ?? 2000);
  const [editDate, setEditDate] = useState(comp.added_at ?? new Date().toISOString().slice(0, 10));

  function openEdit() {
    setEditType(comp.type);
    setEditThreshold(comp.km_threshold ?? 2000);
    setEditDate(comp.added_at ?? new Date().toISOString().slice(0, 10));
    setEditing(true);
  }

  async function handleSave() {
    setBusy(true);
    try {
      await api.updateBikeComponent(bikeId, comp.id, {
        type: editType,
        km_threshold: editThreshold,
        installed_at: editDate,
      });
      setEditing(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  }
  async function handleUninstall() {
    setBusy(true);
    try {
      const pid = await resolvePurchaseId(uninstallPurchaseId);
      await api.uninstallBikeComponent(bikeId, comp.id, uninstallKm, pid);
      setUninstalling(false);
      setUninstallPurchaseId('');
      setNewStockName('');
      onChanged();
    } finally { setBusy(false); }
  }
  async function handleLinkToStock() {
    if (linkPurchaseId === '') return;
    setBusy(true);
    try {
      const pid = await resolvePurchaseId(linkPurchaseId);
      if (pid == null) return;
      // Bereits ausgebaute Komponente: verknüpfen + zurücklegen. Noch verbaute Komponente
      // (aktiv oder inaktiv, aber nicht ausgebaut): nur nachträglich verknüpfen, bleibt verbaut.
      if (comp.uninstalled_km != null) await api.returnComponentToStock(bikeId, comp.id, pid);
      else await api.linkComponentPurchase(bikeId, comp.id, pid);
      setLinking(false);
      setLinkPurchaseId('');
      setNewStockName('');
      onChanged();
    } finally { setBusy(false); }
  }
  async function handleDelete() {
    setBusy(true);
    try { await api.deleteBikeComponent(bikeId, comp.id); onChanged(); }
    finally { setBusy(false); }
  }

  const installedLabel = comp.added_at
    ? new Date(comp.added_at + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null;

  const fieldCls = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary";
  const labelCls = "space-y-1 text-sm text-muted-foreground";

  if (editing) {
    return (
      <div className="rounded-xl border p-4 space-y-4" style={{ borderColor: 'var(--primary)' }}>
        <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Komponente bearbeiten</p>
        <div className="grid grid-cols-2 gap-3">
          <label className={labelCls}>
            <span className="block">Typ</span>
            <select value={editType} onChange={e => setEditType(e.target.value)} className={fieldCls}>
              {COMPONENT_TYPES.map(c => <option key={c.type} value={c.type}>{c.type}</option>)}
            </select>
          </label>
          <label className={labelCls}>
            <span className="block">Wartungsintervall (km)</span>
            <input type="number" value={editThreshold} onChange={e => setEditThreshold(Number(e.target.value))}
              className={fieldCls} min={100} step={100} />
          </label>
          <label className={labelCls}>
            <span className="block">Einbaudatum</span>
            <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className={fieldCls} />
          </label>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={handleSave} disabled={busy}
            className="text-sm px-4 py-1.5 rounded-md font-medium disabled:opacity-40"
            style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
            Speichern
          </button>
          <button onClick={() => setEditing(false)}
            className="text-sm px-4 py-1.5 rounded-md border border-border text-muted-foreground hover:bg-muted">
            Abbrechen
          </button>
        </div>
      </div>
    );
  }

  const isRetired = !!comp.retired_at;
  const actionBtn = "text-sm px-3 py-1.5 rounded-md border font-medium transition-colors disabled:opacity-40";
  const panelFieldCls = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500";

  return (
    <div className={`rounded-xl border border-border p-2.5 space-y-1.5${isRetired ? ' opacity-60' : ' bg-muted/30'}`}>
      {/* Titel + Metadaten + Fortschritt in % */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-x-2.5 gap-y-1 min-w-0 flex-wrap">
          <span className="text-sm font-semibold truncate">{comp.type}</span>
          {isRetired && <Badge variant="secondary">Inaktiv</Badge>}
          {comp.purchase_name && (
            <span className="text-sm text-muted-foreground" title="Verknüpfter Lagerartikel">
              📦 {comp.purchase_name}
            </span>
          )}
          {comp.purchase_url && (
            <a href={comp.purchase_url} target="_blank" rel="noopener noreferrer"
              className="text-sm text-primary hover:underline" title="Bestelllink öffnen">
              ↗ Link
            </a>
          )}
          {installedLabel && <span className="text-sm text-muted-foreground">seit {installedLabel}</span>}
          {isRetired && comp.uninstalled_km != null && (
            <span className="text-sm text-muted-foreground">ausgebaut nach {fmtNum(Math.round(comp.uninstalled_km))} km</span>
          )}
        </div>
        <span className="text-sm font-bold tabular-nums shrink-0" style={{ color }}>
          {Math.round(pct)}%
        </span>
      </div>

      {/* Fortschrittsbalken */}
      <div className="space-y-1">
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
        </div>
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span className="tabular-nums">{fmtNum(Math.round(comp.km_since_service))} / {fmtNum(comp.km_threshold ?? 0)} km</span>
          {pct >= 100
            ? <span className="font-semibold" style={{ color }}>Wartung fällig!</span>
            : comp.estimated_service_date
              ? <span>ca. {new Date(comp.estimated_service_date + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
              : null}
        </div>
      </div>

      {/* Aktionen */}
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <button onClick={openEdit} disabled={busy}
          className={`${actionBtn} border-blue-400 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950`}
          title="Bearbeiten">
          ✎ Bearbeiten
        </button>
        {!isRetired && (
          <button onClick={() => { setUninstallKm(Math.round(comp.km_since_service)); setUninstalling(v => !v); }} disabled={busy}
            className={`${actionBtn} border-amber-400 text-amber-600 dark:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950`}
            title="Komponente ausbauen und ggf. ins Lager zurücklegen">
            Ausbauen
          </button>
        )}
        {isRetired && comp.uninstalled_km != null && comp.purchase_item_id == null && (
          <button onClick={() => setLinking(v => !v)} disabled={busy}
            className={`${actionBtn} border-amber-400 text-amber-600 dark:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950`}
            title="Nachträglich einem Lagerartikel zuordnen und zurücklegen">
            Ins Lager
          </button>
        )}
        {comp.uninstalled_km == null && comp.purchase_item_id == null && (
          <button onClick={() => setLinking(v => !v)} disabled={busy}
            className={`${actionBtn} border-amber-400 text-amber-600 dark:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950`}
            title="Noch verbaute Komponente nachträglich einem Einkauf zuordnen (bleibt verbaut)">
            Verknüpfen
          </button>
        )}
        <button onClick={handleDelete} disabled={busy}
          className={`${actionBtn} border-red-300 text-red-500 hover:bg-red-50 dark:hover:bg-red-950`}
          title="Komponente entfernen">
          Löschen
        </button>
      </div>

      {/* Ausbauen-Panel */}
      {uninstalling && (
        <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/30 p-3 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1">
              <span className="block text-sm text-muted-foreground">Gelaufene km</span>
              <input
                type="number"
                value={uninstallKm}
                onChange={e => setUninstallKm(Number(e.target.value))}
                className={`${panelFieldCls} w-28 tabular-nums`}
                min={0}
              />
            </label>
            {comp.purchase_item_id == null && (
              <label className="space-y-1 flex-1 min-w-[200px]">
                <span className="block text-sm text-muted-foreground">Lagerbezug (optional)</span>
                <select
                  value={uninstallPurchaseId}
                  onChange={e => setUninstallPurchaseId(e.target.value)}
                  className={panelFieldCls}
                  title="Für Altbestand ohne Lagerbezug: nachträglich einem Einkauf zuordnen und zurücklegen"
                >
                  <option value="">– kein Lagerbezug –</option>
                  {availableStock.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.quantity - p.installed_count}x)
                    </option>
                  ))}
                  <option value="__new__">Als Lagerartikel anlegen</option>
                </select>
              </label>
            )}
            {uninstallPurchaseId === '__new__' && (
              <label className="space-y-1 flex-1 min-w-[160px]">
                <span className="block text-sm text-muted-foreground">Name des Lagerartikels</span>
                <input
                  type="text"
                  value={newStockName}
                  onChange={e => setNewStockName(e.target.value)}
                  placeholder="z.B. Continental GP5000"
                  className={panelFieldCls}
                />
              </label>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={handleUninstall} disabled={busy || (uninstallPurchaseId === '__new__' && !newStockName.trim())}
              className="text-sm px-4 py-1.5 rounded-md font-medium border border-amber-400 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 disabled:opacity-40">
              {returnsToStock ? 'Bestätigen + ins Lager' : 'Bestätigen'}
            </button>
            <button onClick={() => { setUninstalling(false); setUninstallPurchaseId(''); setNewStockName(''); }}
              className="text-sm text-muted-foreground hover:underline">
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Nachträglich mit Einkauf verknüpfen (verbaut) bzw. ins Lager zurücklegen (ausgebaut) */}
      {linking && (
        <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/30 p-3 space-y-3">
          <p className="text-sm text-muted-foreground">
            {comp.uninstalled_km != null
              ? 'Ordnet die ausgebaute Komponente einem Einkauf zu und legt sie ins Lager zurück.'
              : 'Ordnet diese aktuell verbaute Komponente nachträglich einem Einkauf zu – sie bleibt verbaut.'}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1 flex-1 min-w-[200px]">
              <span className="block text-sm text-muted-foreground">Lagerartikel</span>
              <select
                value={linkPurchaseId}
                onChange={e => setLinkPurchaseId(e.target.value)}
                className={panelFieldCls}
              >
                <option value="">– Lagerartikel wählen –</option>
                {availableStock.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.quantity - p.installed_count}x)
                  </option>
                ))}
                <option value="__new__">Als Lagerartikel anlegen</option>
              </select>
            </label>
            {linkPurchaseId === '__new__' && (
              <label className="space-y-1 flex-1 min-w-[160px]">
                <span className="block text-sm text-muted-foreground">Name des Lagerartikels</span>
                <input
                  type="text"
                  value={newStockName}
                  onChange={e => setNewStockName(e.target.value)}
                  placeholder="z.B. Continental GP5000"
                  className={panelFieldCls}
                />
              </label>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={handleLinkToStock} disabled={busy || linkPurchaseId === '' || (linkPurchaseId === '__new__' && !newStockName.trim())}
              className="text-sm px-4 py-1.5 rounded-md font-medium border border-amber-400 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 disabled:opacity-40">
              Bestätigen
            </button>
            <button onClick={() => { setLinking(false); setLinkPurchaseId(''); setNewStockName(''); }}
              className="text-sm text-muted-foreground hover:underline">
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Typen die es in vorne/hinten-Varianten gibt
const POSITIONAL_BASES = Array.from(new Set(
  COMPONENT_TYPES
    .filter(c => / (vorne|hinten)$/.test(c.type))
    .map(c => c.type.replace(/ (vorne|hinten)$/, ''))
    .filter(base =>
      COMPONENT_TYPES.some(c => c.type === `${base} vorne`) &&
      COMPONENT_TYPES.some(c => c.type === `${base} hinten`)
    )
));

// Basis-Typen für die Typ-Zuordnung bei Einkäufen (Vorne/Hinten-Varianten zusammengefasst)
const PURCHASE_TYPE_OPTIONS = Array.from(new Set(
  COMPONENT_TYPES.map(c => c.type.replace(/ (vorne|hinten)$/, ''))
));

function detectBase(purchaseName: string): string | null {
  const lower = purchaseName.toLowerCase();
  return POSITIONAL_BASES.find(b => lower.includes(b.toLowerCase())) ?? null;
}

// Positional-Basis eines Einkaufs ermitteln: expliziter Typ hat Vorrang vor Namens-Erkennung
// (wichtig für fremdsprachige/uneindeutige Artikelnamen wie "Fincci Bicycle Tyre 700X23C")
function resolvePositionalBase(p: Purchase): string | null {
  if (p.component_type) return POSITIONAL_BASES.includes(p.component_type) ? p.component_type : null;
  return detectBase(p.name);
}

function AddComponentForm({
  bikeId, stockItems, onAdded,
}: {
  bikeId: string;
  stockItems: Purchase[];
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<number | ''>('');
  const [selectedType, setSelectedType] = useState(COMPONENT_TYPES[0].type);
  const [threshold, setThreshold] = useState(COMPONENT_TYPES[0].threshold);
  const [position, setPosition] = useState<'vorne' | 'hinten'>('vorne');
  const [installedAt, setInstalledAt] = useState(new Date().toISOString().slice(0, 10));
  const [carryOverReturnId, setCarryOverReturnId] = useState<number | ''>('');
  const [busy, setBusy] = useState(false);

  const available = stockItems.filter(p => p.quantity - p.installed_count > 0);
  const selectedPurchase = available.find(p => p.id === selectedPurchaseId) ?? null;

  const detectedBase = selectedPurchase ? resolvePositionalBase(selectedPurchase) : null;
  const isPositional = detectedBase !== null;
  const effectiveType = isPositional ? `${detectedBase} ${position}` : selectedType;

  // Rückläufer dieses Einkaufs (Vorbelastung übernehmbar) – Backend liefert hier immer nur noch
  // nicht wiedereingebaute (offene) Rückgaben, da ein wiedereingebauter Eintrag gelöscht statt
  // markiert wird. Es kann mehrere gleichzeitig geben (z.B. mehrere gebrauchte Exemplare mit
  // unterschiedlichem km-Stand neben einem frisch gekauften), daher Auswahl statt Checkbox.
  const openReturns = selectedPurchase
    ? [...selectedPurchase.returns].sort((a, b) => (a.returned_at ?? '').localeCompare(b.returned_at ?? ''))
    : [];

  function handlePurchaseChange(val: string) {
    const id = val === '' ? '' : Number(val);
    setSelectedPurchaseId(id);
    setCarryOverReturnId('');
    if (id === '') return;
    const p = available.find(x => x.id === id);
    if (!p) return;
    const base = resolvePositionalBase(p);
    if (base) {
      // Positional: threshold aus dem vorne-Typ lesen
      const def = COMPONENT_TYPES.find(c => c.type === `${base} vorne`);
      if (def) setThreshold(def.threshold);
    } else if (p.component_type) {
      // Expliziter, nicht-positionaler Typ am Einkauf hinterlegt
      const def = COMPONENT_TYPES.find(c => c.type === p.component_type);
      if (def) { setSelectedType(def.type); setThreshold(def.threshold); }
    } else {
      // Kein expliziter Typ: ersten zum Namen passenden Typ vorauswählen
      const lower = p.name.toLowerCase();
      const match = COMPONENT_TYPES.find(c => lower.includes(c.type.toLowerCase()));
      if (match) { setSelectedType(match.type); setThreshold(match.threshold); }
    }
  }

  function handleTypeChange(t: string) {
    setSelectedType(t);
    const def = COMPONENT_TYPES.find(c => c.type === t);
    if (def) setThreshold(def.threshold);
  }

  async function handleAdd() {
    if (selectedPurchaseId === '') return;
    setBusy(true);
    try {
      await api.addBikeComponent(bikeId, {
        type: effectiveType,
        km_threshold: threshold,
        installed_at: installedAt,
        purchase_id: selectedPurchaseId as number,
        return_id: carryOverReturnId === '' ? undefined : carryOverReturnId,
      });
      setOpen(false);
      setSelectedPurchaseId('');
      setPosition('vorne');
      setCarryOverReturnId('');
      onAdded();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        disabled={available.length === 0}
        className="w-full text-sm font-medium py-2.5 rounded-xl border border-dashed border-border text-primary hover:bg-primary/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title={available.length === 0 ? 'Kein Lagerbestand vorhanden' : undefined}
      >
        + Komponente einbauen
      </button>
    );
  }

  const fieldCls = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary";
  const labelCls = "space-y-1 text-sm text-muted-foreground";

  return (
    <div className="rounded-xl border p-4 space-y-4" style={{ borderColor: 'var(--primary)' }}>
      <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Komponente einbauen</p>
      <label className={labelCls}>
        <span className="block">Lagerartikel</span>
        <select
          value={selectedPurchaseId}
          onChange={e => handlePurchaseChange(e.target.value)}
          className={fieldCls}
        >
          <option value="">– Lagerartikel wählen –</option>
          {available.map(p => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.quantity - p.installed_count}x)
            </option>
          ))}
        </select>
      </label>

      {selectedPurchaseId !== '' && (
        <div className="grid grid-cols-2 gap-3">
          <label className={labelCls}>
            <span className="block">Typ</span>
            {isPositional ? (
              // Vorne/Hinten-Toggle für Schlauch, Mantel etc.
              <div className="flex rounded-md overflow-hidden border border-border">
                {(['vorne', 'hinten'] as const).map(pos => (
                  <button
                    key={pos}
                    onClick={() => setPosition(pos)}
                    className={`flex-1 py-1.5 text-sm font-medium transition-colors ${
                      position === pos
                        ? 'text-white'
                        : 'text-muted-foreground hover:bg-muted'
                    }`}
                    style={position === pos ? { background: 'var(--primary)' } : {}}
                  >
                    {pos.charAt(0).toUpperCase() + pos.slice(1)}
                  </button>
                ))}
              </div>
            ) : (
              <select
                value={selectedType}
                onChange={e => handleTypeChange(e.target.value)}
                className={fieldCls}
              >
                {COMPONENT_TYPES.map(c => (
                  <option key={c.type} value={c.type}>{c.type}</option>
                ))}
              </select>
            )}
          </label>
          <label className={labelCls}>
            <span className="block">Wartungsintervall (km)</span>
            <input
              type="number"
              value={threshold}
              onChange={e => setThreshold(Number(e.target.value))}
              className={`${fieldCls} tabular-nums`}
              min={100}
              step={100}
            />
          </label>
          <label className={labelCls}>
            <span className="block">Einbaudatum</span>
            <input
              type="date"
              value={installedAt}
              onChange={e => setInstalledAt(e.target.value)}
              className={fieldCls}
            />
          </label>
        </div>
      )}
      {openReturns.length > 0 && (
        <label className={labelCls}>
          <span className="block">Vorbelastung übernehmen (welches Exemplar wird eingebaut?)</span>
          <select
            value={carryOverReturnId}
            onChange={e => setCarryOverReturnId(e.target.value === '' ? '' : Number(e.target.value))}
            className={fieldCls}
          >
            <option value="">– neu, keine Vorbelastung –</option>
            {openReturns.map(r => (
              <option key={r.id} value={r.id}>
                {fmtNum(Math.round(r.km_ridden ?? 0))} km
                {r.returned_at ? ` (zurückgelegt ${new Date(r.returned_at + 'T00:00:00').toLocaleDateString('de-DE')})` : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleAdd}
          disabled={busy || selectedPurchaseId === ''}
          className="text-sm px-4 py-1.5 rounded-md font-medium disabled:opacity-40"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
        >
          Einbauen{isPositional && selectedPurchaseId !== '' ? ` (${effectiveType})` : ''}
        </button>
        <button onClick={() => setOpen(false)} className="text-sm px-4 py-1.5 rounded-md border border-border text-muted-foreground hover:bg-muted">
          Abbrechen
        </button>
      </div>
    </div>
  );
}

// ─── Bike-Karte ───────────────────────────────────────────────────────────────

function BikeCard({
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
                {bike.image_filename ? 'Ändern' : 'Hochladen'}
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
                  title="Klicken zum Bearbeiten"
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
              title="Klicken um Status zu wechseln"
            >
              {bike.retired ? 'Inaktiv' : '● Aktiv'}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-lg bg-muted/60 px-3 py-2 flex items-baseline justify-between gap-2">
            <span className="text-sm uppercase tracking-wider text-muted-foreground">Rides</span>
            <span className="text-xl font-bold text-primary">{bike.ride_count}</span>
          </div>
          <div className="rounded-lg bg-muted/60 px-3 py-2 flex items-baseline justify-between gap-2">
            <span className="text-sm uppercase tracking-wider text-muted-foreground">Gesamt km</span>
            <span className="text-xl font-bold">{fmtNum(Math.round(bike.current_km))}</span>
          </div>
        </div>

        {/* Verschleiß */}
        <div className="border-t border-border pt-3 space-y-1.5">
          <p className="text-sm font-semibold">Verschleiß</p>
          {bike.components.length === 0 && (
            <p className="text-sm text-muted-foreground">Keine Komponenten erfasst.</p>
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
          Alle Aktivitäten →
        </Link>
      </CardContent>
    </Card>
  );
}

// ─── Übersicht-Tab ────────────────────────────────────────────────────────────

function UebersichtTab() {
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
      .catch(e => setError(e instanceof Error ? e.message : 'Fehler'))
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
        <p className="col-span-2 text-muted-foreground">Keine Bikes gefunden.</p>
      )}
    </div>

    <div className="mt-8 space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Einkäufe / Lager</h2>
      <EinkäufeTab externalKey={purchaseRefreshKey} onChanged={reloadAll} />
    </div>

    {inactiveBikes.length > 0 && (
      <div className="mt-8 rounded-xl border border-border p-4 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-muted-foreground">Inaktive Räder</span>
          <select
            value={selectedInactiveId ?? ''}
            onChange={e => setSelectedInactiveId(e.target.value || null)}
            className="text-sm rounded-md border border-border bg-background px-2.5 py-1.5 focus:outline-none max-w-[240px]"
          >
            <option value="">– Rad wählen –</option>
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

// ─── Vergleich-Tab ────────────────────────────────────────────────────────────

function VergleichTab() {
  const [data, setData] = useState<BikeCompareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.bikeCompare()
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : 'Fehler'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        {[0, 1, 2].map(i => <div key={i} className="h-48 animate-pulse rounded-xl bg-muted" />)}
      </div>
    );
  }

  if (error || !data?.summary.length) {
    return error
      ? <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
      : <p className="text-sm text-muted-foreground">Keine Bike-Daten vorhanden. Erst importieren.</p>;
  }

  const filteredYearly = data.yearly.filter(y => parseInt(y.year) >= 2000);
  const histograms = Object.fromEntries(
    data.summary.map(b => [b.id, buildHistogram(data.distances[b.id] ?? [])])
  );

  // Balkendiagramm: Rides pro Jahr
  const BAR_W = 900, BAR_H = 220;
  const BAR_PAD = { top: 16, right: 16, bottom: 40, left: 48 };
  const barChartW = BAR_W - BAR_PAD.left - BAR_PAD.right;
  const barChartH = BAR_H - BAR_PAD.top - BAR_PAD.bottom;

  let maxRides = 0;
  for (const y of filteredYearly)
    for (const b of data.summary) {
      const r = y.bikes[b.id]?.rides ?? 0;
      if (r > maxRides) maxRides = r;
    }
  maxRides = Math.ceil(maxRides / 10) * 10 || 10;

  function barGroupW() { return barChartW / (filteredYearly.length || 1); }
  function barX(yi: number, bi: number) {
    const gw = barGroupW();
    const margin = gw * 0.1;
    const avail = gw - margin * 2;
    const bw = avail / data!.summary.length;
    return BAR_PAD.left + yi * gw + margin + bi * bw;
  }
  function barBW() {
    const gw = barGroupW();
    const margin = gw * 0.1;
    return (gw - margin * 2) / data!.summary.length - 1;
  }
  function barY(v: number) { return BAR_PAD.top + barChartH - (v / maxRides) * barChartH; }
  function barH(v: number) { return (v / maxRides) * barChartH; }

  // Liniendiagramm: Ø Speed
  const LINE_W = 900, LINE_H = 200;
  const LINE_PAD = { top: 16, right: 16, bottom: 36, left: 52 };
  const lineChartW = LINE_W - LINE_PAD.left - LINE_PAD.right;
  const lineChartH = LINE_H - LINE_PAD.top - LINE_PAD.bottom;

  const allSpeeds = filteredYearly.flatMap(y =>
    data.summary.map(b => y.bikes[b.id]?.avg_speed_kmh ?? null).filter((v): v is number => v !== null)
  );
  const minSpeed = allSpeeds.length ? Math.floor(Math.min(...allSpeeds) - 1) : 0;
  const maxSpeed = allSpeeds.length ? Math.ceil(Math.max(...allSpeeds) + 1) : 40;

  function lineX(i: number) {
    if (filteredYearly.length <= 1) return LINE_PAD.left + lineChartW / 2;
    return LINE_PAD.left + (i / (filteredYearly.length - 1)) * lineChartW;
  }
  function lineY(v: number) {
    const range = maxSpeed - minSpeed || 1;
    return LINE_PAD.top + lineChartH - ((v - minSpeed) / range) * lineChartH;
  }
  function speedYTicks() {
    const range = maxSpeed - minSpeed;
    const step = range > 10 ? 2 : 1;
    const ticks: number[] = [];
    for (let v = Math.ceil(minSpeed); v <= maxSpeed; v += step) ticks.push(v);
    return ticks;
  }

  // Histogramm: Distanzverteilung
  const HIST_W = 900, HIST_H = 200;
  const HIST_PAD = { top: 16, right: 16, bottom: 40, left: 52 };
  const histChartW = HIST_W - HIST_PAD.left - HIST_PAD.right;
  const histChartH = HIST_H - HIST_PAD.top - HIST_PAD.bottom;

  let maxHistCount = 0;
  for (const b of data.summary) {
    const h = buildHistogram(data.distances[b.id] ?? []);
    for (const c of h) if (c > maxHistCount) maxHistCount = c;
  }
  maxHistCount = Math.ceil(maxHistCount / 5) * 5 || 5;

  function histBarX(binIdx: number, bi: number) {
    const gw = histChartW / BINS.length;
    const margin = gw * 0.08;
    const avail = gw - margin * 2;
    const bw = avail / data!.summary.length;
    return HIST_PAD.left + binIdx * gw + margin + bi * bw;
  }
  function histBW() {
    const gw = histChartW / BINS.length;
    const margin = gw * 0.08;
    return (gw - margin * 2) / data!.summary.length - 1;
  }
  function histBarY(v: number) { return HIST_PAD.top + histChartH - (v / maxHistCount) * histChartH; }
  function histBarH(v: number) { return (v / maxHistCount) * histChartH; }
  function histGroupCenter(binIdx: number) {
    const gw = histChartW / BINS.length;
    return HIST_PAD.left + binIdx * gw + gw / 2;
  }

  return (
    <div className="space-y-8">
      {/* Kennzahlen-Tabelle */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Kennzahlen</h2>
        <Card className="overflow-x-auto shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="py-2 pr-4 text-left text-xs font-normal text-muted-foreground" />
                {data.summary.map((bike, i) => (
                  <th key={bike.id} className="px-3 py-2 text-right font-semibold" style={{ color: bikeColor(i) }}>
                    {bike.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ROWS.map(row => (
                <tr key={row.key} className="hover:bg-muted/30 transition-colors">
                  <td className="py-2.5 pr-4 text-xs text-muted-foreground">{row.label}</td>
                  {data.summary.map((bike, i) => {
                    const val = (bike as unknown as Record<string, number>)[row.key];
                    return (
                      <td key={bike.id} className="px-3 py-2.5 text-right font-mono tabular-nums">
                        <span style={{ color: bikeColor(i) }}>{row.fmt(val)}</span>
                        <span className="text-xs text-muted-foreground">{row.unit}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      {/* Rides pro Jahr */}
      {filteredYearly.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Aktivitäten pro Jahr</h2>
          <Card className="shadow-sm">
            <CardContent className="p-4">
              <div className="mb-3 flex gap-5 text-xs text-muted-foreground">
                {data.summary.map((bike, i) => (
                  <span key={bike.id} className="flex items-center gap-1.5">
                    <span className="inline-block h-3 w-3 rounded-sm" style={{ background: bikeColor(i) }} />
                    {bike.name}
                  </span>
                ))}
              </div>
              <svg viewBox={`0 0 ${BAR_W} ${BAR_H}`} width="100%" className="block">
                {yTicks(maxRides).map(v => (
                  <g key={v}>
                    <line x1={BAR_PAD.left} y1={barY(v)} x2={BAR_W - BAR_PAD.right} y2={barY(v)} stroke="#e5e7eb" strokeWidth={v === 0 ? 1 : 0.7} />
                    <text x={BAR_PAD.left - 6} y={barY(v) + 4} fontSize={11} fill="#9ca3af" textAnchor="end">{v}</text>
                  </g>
                ))}
                {filteredYearly.map((yearEntry, yi) => (
                  <g key={yearEntry.year}>
                    {data.summary.map((bike, bi) => {
                      const rides = yearEntry.bikes[bike.id]?.rides ?? 0;
                      if (rides === 0) return null;
                      return (
                        <rect
                          key={bike.id}
                          x={barX(yi, bi).toFixed(1)}
                          y={barY(rides).toFixed(1)}
                          width={Math.max(barBW(), 2).toFixed(1)}
                          height={barH(rides).toFixed(1)}
                          fill={bikeColor(bi)} opacity={0.85} rx={2}
                        />
                      );
                    })}
                    <text
                      x={(BAR_PAD.left + yi * barGroupW() + barGroupW() / 2).toFixed(1)}
                      y={BAR_H - 8}
                      fontSize={10} fill="#9ca3af" textAnchor="middle"
                    >{yearEntry.year}</text>
                  </g>
                ))}
                <line x1={BAR_PAD.left} y1={BAR_PAD.top + barChartH} x2={BAR_W - BAR_PAD.right} y2={BAR_PAD.top + barChartH} stroke="#e5e7eb" strokeWidth={1} />
              </svg>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Ø Geschwindigkeit über Jahre */}
      {filteredYearly.length > 1 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Ø Geschwindigkeit über Jahre</h2>
          <Card className="shadow-sm">
            <CardContent className="p-4">
              <div className="mb-3 flex gap-5 text-xs text-muted-foreground">
                {data.summary.map((bike, i) => (
                  <span key={bike.id} className="flex items-center gap-1.5">
                    <span className="inline-block h-0.5 w-6 rounded" style={{ background: bikeColor(i) }} />
                    {bike.name}
                  </span>
                ))}
              </div>
              <svg viewBox={`0 0 ${LINE_W} ${LINE_H}`} width="100%" className="block">
                {speedYTicks().map(v => (
                  <g key={v}>
                    <line x1={LINE_PAD.left} y1={lineY(v)} x2={LINE_W - LINE_PAD.right} y2={lineY(v)} stroke="#e5e7eb" strokeWidth={0.7} />
                    <text x={LINE_PAD.left - 6} y={lineY(v) + 4} fontSize={11} fill="#9ca3af" textAnchor="end">{v}</text>
                  </g>
                ))}
                <text x={10} y={LINE_PAD.top + lineChartH / 2} fontSize={10} fill="#9ca3af" textAnchor="middle" transform={`rotate(-90, 10, ${LINE_PAD.top + lineChartH / 2})`}>km/h</text>
                {filteredYearly.map((ye, i) => (
                  <text key={ye.year} x={lineX(i)} y={LINE_H - 8} fontSize={10} fill="#9ca3af" textAnchor="middle">{ye.year}</text>
                ))}
                <line x1={LINE_PAD.left} y1={LINE_PAD.top + lineChartH} x2={LINE_W - LINE_PAD.right} y2={LINE_PAD.top + lineChartH} stroke="#e5e7eb" strokeWidth={1} />
                {data.summary.map((bike, bi) => {
                  const pts = filteredYearly
                    .map((ye, i) => {
                      const speed = ye.bikes[bike.id]?.avg_speed_kmh;
                      return speed != null ? `${lineX(i).toFixed(1)},${lineY(speed).toFixed(1)}` : null;
                    })
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <g key={bike.id}>
                      {pts && (
                        <polyline points={pts} fill="none" stroke={bikeColor(bi)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                      )}
                      {filteredYearly.map((ye, i) => {
                        const speed = ye.bikes[bike.id]?.avg_speed_kmh;
                        if (speed == null) return null;
                        return (
                          <circle key={ye.year} cx={lineX(i)} cy={lineY(speed)} r={3.5} fill={bikeColor(bi)} stroke="white" strokeWidth={1.5} />
                        );
                      })}
                    </g>
                  );
                })}
              </svg>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Distanzverteilung */}
      {Object.keys(data.distances).length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Distanzverteilung</h2>
          <Card className="shadow-sm">
            <CardContent className="p-4">
              <div className="mb-3 flex gap-5 text-xs text-muted-foreground">
                {data.summary.map((bike, i) => (
                  <span key={bike.id} className="flex items-center gap-1.5">
                    <span className="inline-block h-3 w-3 rounded-sm" style={{ background: bikeColor(i) }} />
                    {bike.name}
                  </span>
                ))}
              </div>
              <svg viewBox={`0 0 ${HIST_W} ${HIST_H}`} width="100%" className="block">
                {yTicks(maxHistCount).map(v => (
                  <g key={v}>
                    <line x1={HIST_PAD.left} y1={histBarY(v)} x2={HIST_W - HIST_PAD.right} y2={histBarY(v)} stroke="#e5e7eb" strokeWidth={v === 0 ? 1 : 0.7} />
                    <text x={HIST_PAD.left - 6} y={histBarY(v) + 4} fontSize={11} fill="#9ca3af" textAnchor="end">{v}</text>
                  </g>
                ))}
                {BINS.map((_, binIdx) => (
                  <g key={binIdx}>
                    {data.summary.map((bike, bi) => {
                      const count = (histograms[bike.id] ?? [])[binIdx] ?? 0;
                      if (count === 0) return null;
                      return (
                        <rect
                          key={bike.id}
                          x={histBarX(binIdx, bi).toFixed(1)}
                          y={histBarY(count).toFixed(1)}
                          width={Math.max(histBW(), 2).toFixed(1)}
                          height={histBarH(count).toFixed(1)}
                          fill={bikeColor(bi)} opacity={0.85} rx={2}
                        />
                      );
                    })}
                    <text x={histGroupCenter(binIdx)} y={HIST_H - 8} fontSize={9} fill="#9ca3af" textAnchor="middle">{BIN_LABELS[binIdx]}</text>
                  </g>
                ))}
                <line x1={HIST_PAD.left} y1={HIST_PAD.top + histChartH} x2={HIST_W - HIST_PAD.right} y2={HIST_PAD.top + histChartH} stroke="#e5e7eb" strokeWidth={1} />
                <text x={HIST_PAD.left + histChartW / 2} y={HIST_H} fontSize={10} fill="#9ca3af" textAnchor="middle">Distanz (km)</text>
              </svg>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}

// ─── Einkäufe-Tab ─────────────────────────────────────────────────────────────

const EMPTY_FORM = { name: '', shop: '', url: '', price: '', order_date: '', delivery_date: '', quantity: '1', notes: '', component_type: '' };

function EinkäufeTab({ externalKey, onChanged }: { externalKey: number; onChanged: () => void }) {
  const [items, setItems] = useState<Purchase[]>([]);
  const [bikeNames, setBikeNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [onlyStock, setOnlyStock] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    api.listPurchases().then(setItems).finally(() => setLoading(false));
  }
  useEffect(() => { reload(); }, [externalKey]);
  useEffect(() => {
    api.bikes().then(bikes => setBikeNames(Object.fromEntries(bikes.map(b => [b.id, b.name]))));
  }, []);

  function openAdd() { setForm(EMPTY_FORM); setEditId(null); setAddOpen(true); }
  function openEdit(p: Purchase) {
    setForm({
      name: p.name, shop: p.shop ?? '', url: p.url ?? '',
      price: p.price != null ? String(p.price) : '',
      order_date: p.order_date ?? '', delivery_date: p.delivery_date ?? '',
      quantity: String(p.quantity), notes: p.notes ?? '',
      component_type: p.component_type ?? '',
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
      setError(e instanceof Error ? e.message : 'Löschen fehlgeschlagen');
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
            {stockCount} {stockCount === 1 ? 'Artikel' : 'Artikel'} auf Lager
          </span>
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer select-none">
            <input type="checkbox" checked={onlyStock} onChange={e => setOnlyStock(e.target.checked)}
              className="accent-primary" />
            Nur Lagerbestand
          </label>
        </div>
        <button onClick={openAdd}
          className="text-sm px-3 py-1.5 rounded font-medium"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
          + Einkauf erfassen
        </button>
      </div>

      {/* Formular */}
      {addOpen && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              {editId !== null ? 'Einkauf bearbeiten' : 'Neuer Einkauf'}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="col-span-2 sm:col-span-2">
                <label className="text-sm text-muted-foreground">Artikel *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="z. B. Schlauch 28&quot; Conti" className={inputCls} />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Shop</label>
                <input value={form.shop} onChange={e => setForm(f => ({ ...f, shop: e.target.value }))}
                  placeholder="Amazon" className={inputCls} />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Komponenten-Typ</label>
                <select value={form.component_type} onChange={e => setForm(f => ({ ...f, component_type: e.target.value }))}
                  className={inputCls} title="Legt fest, welchem Komponenten-Typ dieser Artikel beim Einbauen zugeordnet wird">
                  <option value="">– automatisch erkennen –</option>
                  {PURCHASE_TYPE_OPTIONS.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2 sm:col-span-3">
                <label className="text-sm text-muted-foreground">Link</label>
                <input type="url" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                  placeholder="https://..." className={inputCls} />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Preis (€)</label>
                <input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                  placeholder="0.00" min={0} step={0.01} className={inputCls} />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Menge</label>
                {editId !== null ? (
                  <p className="text-sm text-muted-foreground px-2.5 py-1.5" title="Änderung der Stückzahl nur über +/− in der Liste">
                    wird über +/− in der Liste angepasst
                  </p>
                ) : (
                  <input type="number" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                    min={1} className={inputCls} />
                )}
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Bestellt am</label>
                <input type="date" value={form.order_date} onChange={e => setForm(f => ({ ...f, order_date: e.target.value }))}
                  className={inputCls} />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Geliefert am</label>
                <input type="date" value={form.delivery_date} onChange={e => setForm(f => ({ ...f, delivery_date: e.target.value }))}
                  className={inputCls} />
              </div>
              <div className="col-span-2 sm:col-span-3">
                <label className="text-sm text-muted-foreground">Notiz</label>
                <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="z. B. für Reifen vorne" className={inputCls} />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={busy || !form.name.trim()}
                className="text-sm px-3 py-1 rounded font-medium disabled:opacity-40"
                style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                Speichern
              </button>
              <button onClick={() => setAddOpen(false)}
                className="text-sm text-muted-foreground hover:underline">
                Abbrechen
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabelle */}
      {displayed.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {onlyStock ? 'Kein Artikel auf Lager.' : 'Noch keine Einkäufe erfasst.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Artikel</th>
                <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Typ</th>
                <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Shop</th>
                <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Preis</th>
                <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Menge</th>
                <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Bestellt</th>
                <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Geliefert</th>
                <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Status</th>
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
                          className="text-sm text-primary hover:underline">↗ Link</a>
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
                    <td className="px-3 py-2 text-muted-foreground">{p.component_type ?? '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{p.shop ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {p.price != null ? `${fmtNum(p.price, 2)} €` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => handleAdjust(p.id, -1)} disabled={busy || p.quantity <= p.installed_count}
                          title={p.quantity <= p.installed_count
                            ? `${p.installed_count}x aktuell verbaut – Menge kann nicht weiter verringert werden`
                            : 'Menge verringern (z.B. verschenkt/verloren)'}
                          className="w-7 h-7 rounded border border-amber-400 text-amber-500 text-base font-bold text-center leading-none hover:bg-amber-50 dark:hover:bg-amber-950 disabled:opacity-30">−</button>
                        <span className={`font-semibold tabular-nums text-sm ${depleted ? 'text-destructive' : 'text-green-600'}`}>
                          {inStock}
                        </span>
                        <span className="text-muted-foreground text-sm">/ {p.quantity}</span>
                        <button onClick={() => handleAdjust(p.id, 1)} disabled={busy}
                          title="Menge erhöhen (neues Exemplar dazugekommen)"
                          className="w-7 h-7 rounded border border-blue-400 text-blue-500 text-base font-bold text-center leading-none hover:bg-blue-50 dark:hover:bg-blue-950 disabled:opacity-30">+</button>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{fmtDate(p.order_date)}</td>
                    <td className="px-3 py-2">
                      {p.delivery_date
                        ? <span className="text-muted-foreground">{fmtDate(p.delivery_date)}</span>
                        : <span className="text-amber-500 font-medium">ausstehend</span>
                      }
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-sm font-semibold ${depleted ? 'text-destructive' : 'text-green-600'}`}>
                        {depleted ? 'aufgebraucht' : `${inStock}x auf Lager`}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => openEdit(p)} disabled={busy}
                          className="text-sm px-3 py-1.5 rounded-md border font-medium transition-colors disabled:opacity-40 border-blue-400 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950">
                          ✎ Bearbeiten
                        </button>
                        <button onClick={() => handleDelete(p.id)} disabled={busy}
                          className="text-sm px-3 py-1.5 rounded-md border font-medium transition-colors disabled:opacity-40 border-red-300 text-red-500 hover:bg-red-50 dark:hover:bg-red-950">
                          Löschen
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

// ─── Gelöscht-Tab ─────────────────────────────────────────────────────────────

function GeloeschtTab() {
  const [items, setItems] = useState<DeletedComponent[]>([]);
  const [bikeNames, setBikeNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.deletedComponents().then(setItems).finally(() => setLoading(false));
    api.bikes().then(bikes => setBikeNames(Object.fromEntries(bikes.map(b => [b.id, b.name]))));
  }, []);

  function fmtDate(iso: string | null) {
    if (!iso) return '—';
    return new Date(iso + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  if (loading) return <p className="text-sm text-muted-foreground">Lädt…</p>;
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Noch keine Komponenten gelöscht.</p>;

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Typ</th>
            <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Bike</th>
            <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Einkauf</th>
            <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Gefahren</th>
            <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Eingebaut</th>
            <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Gelöscht</th>
          </tr>
        </thead>
        <tbody>
          {items.map(c => (
            <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
              <td className="px-3 py-2 font-medium">{c.type}</td>
              <td className="px-3 py-2 text-muted-foreground">{bikeNames[c.bike_id] ?? c.bike_id}</td>
              <td className="px-3 py-2 text-muted-foreground">
                {c.purchase_name ?? '—'}
                {c.url && (
                  <>
                    {' · '}
                    <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">↗ Link</a>
                  </>
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtNum(Math.round(c.km_since_service))} km</td>
              <td className="px-3 py-2 text-muted-foreground">{fmtDate(c.added_at)}</td>
              <td className="px-3 py-2 text-muted-foreground">{fmtDate(c.deleted_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Haupt-Seite ──────────────────────────────────────────────────────────────

export default function BikesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') ?? 'übersicht';

  function handleTabChange(value: string) {
    setSearchParams({ tab: value }, { replace: true });
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Bikes" />

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="übersicht">Übersicht</TabsTrigger>
          <TabsTrigger value="gelöscht">Gelöscht</TabsTrigger>
          <TabsTrigger value="vergleich">Vergleich</TabsTrigger>
        </TabsList>

        <TabsContent value="übersicht" className="mt-6">
          <UebersichtTab />
        </TabsContent>

        <TabsContent value="gelöscht" className="mt-6">
          <GeloeschtTab />
        </TabsContent>

        <TabsContent value="vergleich" className="mt-6">
          <VergleichTab />
        </TabsContent>

      </Tabs>
    </div>
  );
}
