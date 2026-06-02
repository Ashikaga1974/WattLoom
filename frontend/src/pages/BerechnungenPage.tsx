import { COMPARISON_SIMPLIFY, THRESHOLD_HR_RATIO } from '@/lib/config';
import { useConfig } from '@/lib/config-context';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

// Hilfkomponente für eine Parameter-Zeile
function ParamRow({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="text-muted-foreground w-52 shrink-0">{label}</span>
      <span className="flex-1">{value}</span>
      {note && <span className="text-muted-foreground/60 text-xs self-center">{note}</span>}
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-foreground">{children}</code>
  );
}

function Val({ v }: { v: React.ReactNode }) {
  return (
    <span className="text-orange-500 font-mono font-semibold">{v}</span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      <Separator />
      <div className="space-y-3 text-sm text-foreground">{children}</div>
    </section>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-4 space-y-2">{children}</CardContent>
    </Card>
  );
}

function SubSection({ title, color = 'border-muted', children }: { title: string; color?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-medium text-foreground mb-1">{title}</p>
      <div className={`space-y-1 pl-3 border-l-2 ${color} text-muted-foreground`}>{children}</div>
    </div>
  );
}

// HR-Zonen-Tabelle
const HR_ZONES = [
  { zone: 'Z1 · Regeneration', range: '0–60 %',   color: '#60a5fa' },
  { zone: 'Z2 · Grundlage',    range: '60–70 %',  color: '#4ade80' },
  { zone: 'Z3 · Tempo',        range: '70–80 %',  color: '#facc15' },
  { zone: 'Z4 · Schwelle',     range: '80–90 %',  color: '#fb923c' },
  { zone: 'Z5 · VO2max',       range: '90–100 %', color: '#ef4444' },
];

const POWER_ZONES = [
  { zone: 'Z1 · Active Recovery', range: '0–55 %',    color: '#60a5fa' },
  { zone: 'Z2 · Endurance',       range: '55–75 %',   color: '#4ade80' },
  { zone: 'Z3 · Tempo',           range: '75–90 %',   color: '#a3e635' },
  { zone: 'Z4 · Schwelle',        range: '90–105 %',  color: '#facc15' },
  { zone: 'Z5 · VO2max',          range: '105–120 %', color: '#fb923c' },
  { zone: 'Z6 · Anaerob',         range: '120–150 %', color: '#f87171' },
  { zone: 'Z7 · Neuromuskulär',   range: '> 150 %',   color: '#c084fc' },
];

export default function BerechnungenPage() {
  const config = useConfig();
  return (
    <div className="space-y-10 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Berechnungen & Annahmen</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Alle Parameter werden direkt aus dem Code gelesen – diese Seite ist immer aktuell.
        </p>
      </div>

      {/* ── Dashboard – Sparklines ── */}
      <Section title="Dashboard – Sparklines">
        <p>Jede Stat-Kachel zeigt ein Balkendiagramm der letzten Aktivitätsperiode.</p>
        <InfoBox>
          <ParamRow label="Ohne Jahresfilter" value={<>Letzte <Val v={config.sparkline_weeks} /> Wochen, gruppiert per Kalenderwochen-Abstand zu heute</>} />
          <ParamRow label="Mit Jahresfilter" value="12 Monate des gewählten Jahres (Jan–Dez)" />
          <ParamRow label="Wochenberechnung" value={<Code>CAST((julianday('now') − julianday(start_date)) / 7 AS INTEGER)</Code>} />
          <ParamRow label="Fehlende Wochen/Monate" value="Werden mit 0 aufgefüllt – Lücken im Aktivitätsverlauf sind sichtbar" />
        </InfoBox>
      </Section>

      {/* ── Karte – Geschwindigkeitsfärbung ── */}
      <Section title="Aktivitätskarte – Geschwindigkeitsfärbung">
        <p>Die Route wird in Segmente gleicher Farbe aufgeteilt. Langsam = Blau, schnell = Rot.</p>
        <InfoBox>
          <ParamRow label="Farbstufen" value={<><Val v={config.speed_color_buckets} /> gleichmäßige Buckets zwischen Mindest- und Höchstgeschwindigkeit</>} />
          <ParamRow label="Farbmodell" value={<Code>HSL(240 − t·240, 80%, 55%) mit t = (v − v_min) / (v_max − v_min)</Code>} />
          <ParamRow label="Min/Max-Basis" value="Alle Punkte mit Geschwindigkeit > 0 km/h (Stillstand wird ignoriert)" />
          <ParamRow label="Segmentierung" value="Aufeinanderfolgende Punkte im gleichen Bucket werden zu einer Polyline zusammengefasst" />
          <ParamRow label="Track-Vereinfachung" value={<>Ramer-Douglas-Peucker mit Toleranz <Val v={`${config.track_simplify_m} m`} /> vor der Übertragung</>} />
        </InfoBox>
      </Section>

      {/* ── Aktivitätsprofile ── */}
      <Section title="Aktivitätsdetail – Diagrammprofile">
        <InfoBox>
          <SubSection title="Höhenprofil">
            <p><span className="text-muted-foreground">Y-Achse:</span> tatsächliche Höhe in m ü. NN (Minimum bis Maximum)</p>
            <p><span className="text-muted-foreground">Höhengewinn:</span> <Code>Σ max(0, alt[i] − alt[i−1])</Code> – nur positive Differenzen</p>
            <p><span className="text-muted-foreground">Null-Filter:</span> Punkte ohne Höhendaten werden übersprungen</p>
          </SubSection>
          <SubSection title="Geschwindigkeitsprofil">
            <p><span className="text-muted-foreground">Y-Achse:</span> km/h, gerundet auf 5er-Schritte (Minimum / Maximum)</p>
            <p><span className="text-muted-foreground">Durchschnitt:</span> arithmetisches Mittel aller Punkte mit Geschwindigkeit &gt; 0</p>
          </SubSection>
          <SubSection title="Herzfrequenzprofil">
            <p><span className="text-muted-foreground">Y-Achse:</span> bpm, gerundet auf 5er-Schritte (Minimum / Maximum)</p>
            <p><span className="text-muted-foreground">Durchschnitt:</span> arithmetisches Mittel aller Punkte mit HR &gt; 0</p>
          </SubSection>
          <SubSection title="Kombiniertes Profil">
            <p><span className="text-muted-foreground">Normalisierung:</span> jede Datenreihe unabhängig auf 0–1 skaliert: <Code>(v − min) / (max − min)</Code></p>
            <p><span className="text-muted-foreground">Lücken:</span> Punkte ohne Wert werden auf y = 0 gesetzt (sichtbare Lücke im Profil)</p>
          </SubSection>
        </InfoBox>
      </Section>

      {/* ── Bezier-Glättung ── */}
      <Section title="Diagramm-Kurven – Glättung">
        <p>Alle Liniendiagramme verwenden kubische Bezier-Splines (Catmull-Rom-Konvertierung) statt gerader Liniensegmente.</p>
        <InfoBox>
          <ParamRow label="Methode" value="Catmull-Rom → kubische Bezier" />
          <ParamRow label="Spannung (Tension)" value={<><Val v={config.bezier_tension} /> – 0 = gerade Linien, 0.5 = starke Rundung</>} />
          <ParamRow label="Kontrollpunkte" value={<Code>cp1 = P[i] + (P[i+1] − P[i−1]) · T</Code>} />
          <ParamRow label="Endpunkte" value="Erstes und letztes Segment clamp auf sich selbst (kein Überschwingen)" />
          <ParamRow label="Lücken" value="Jeder kontinuierliche Abschnitt wird separat geglättet; Null-Werte erzeugen ein neues Segment" />
        </InfoBox>
      </Section>

      {/* ── Jahresfortschritt ── */}
      <Section title="Jahresfortschritt & Prognose">
        <InfoBox>
          <SubSection title="Kumulierter Jahresfortschritt">
            <p><span className="text-muted-foreground">X-Achse:</span> Jahrestag 1–365 (1. Jan bis 31. Dez)</p>
            <p><span className="text-muted-foreground">Y-Wert:</span> kumulierte Kilometer bis zu diesem Tag</p>
            <p><span className="text-muted-foreground">Jahrestag (heute):</span> <Code>⌊(now − 1. Jan) / 86 400 000 ms⌋</Code></p>
          </SubSection>
          <SubSection title="Jahresprognose">
            <p><span className="text-muted-foreground">Methode:</span> lineare Extrapolation auf Basis der bisherigen Saison</p>
            <p><span className="text-muted-foreground">Formel:</span> <Code>Prognose = (km_heute / Jahrestag_heute) × 365</Code></p>
            <p><span className="text-muted-foreground">Annahme:</span> gleichmäßige Verteilung – saisonale Schwankungen werden <em>nicht</em> berücksichtigt</p>
          </SubSection>
        </InfoBox>
      </Section>

      {/* ── FTP-Schätzung ── */}
      <Section title="FTP-Schätzung (HR-korrigiert)">
        <p>
          Mangels Leistungsmesser wird die FTP aus durchschnittlicher Leistung (Garmin-Summendaten) und Herzfrequenz extrapoliert.
          Basis: lineare Power/HR-Beziehung, extrapoliert zur Schwellen-HR.
        </p>
        <InfoBox>
          <ParamRow label="Ride-Filter" value={<>Nur Rides mit Leistungsdaten und Dauer <Code>45–75 min (2 700–4 500 s)</Code></>} />
          <ParamRow label="HR-Filter" value={<>Nur Rides mit avg_hr ≥ 65 % HRmax (<Code>MIN_HR_RATIO = 0.65</Code>)</>} />
          <ParamRow
            label="Formel (mit HR)"
            value={<Code>FTP = avg_power × {THRESHOLD_HR_RATIO} / (avg_hr / HRmax)</Code>}
          />
          <ParamRow
            label="Faktor erklärt"
            value={<><Code>{THRESHOLD_HR_RATIO} = 0.90 × 1.20</Code> – Schwellen-HR bei 90 % HRmax + 20 % Korrekturfaktor</>}
          />
          <ParamRow
            label="Formel (ohne HR)"
            value={<Code>FTP = avg_power × 1.38</Code>}
            note="(1.15 × 1.20)"
          />
          <ParamRow label="HRmax" value={<>Globales Maximum aller Aktivitäten (<Code>MAX(max_hr)</Code>)</>} />
          <ParamRow label="Darstellung" value="Trend-Chart: gleitende Schätzung pro Ride über Zeit; aktueller FTP = Mittelwert der letzten 90 Tage" />
        </InfoBox>
      </Section>

      {/* ── VO2max ── */}
      <Section title="VO2max-Schätzung">
        <p>
          Näherungsformel nach Coggan aus dem FTP-Wert und Körpergewicht.
          Nur eine grobe Einschätzung – kein Ersatz für einen Labortest.
        </p>
        <InfoBox>
          <ParamRow label="Formel" value={<Code>VO2max = (FTP_W / Gewicht_kg) × 10.8 + 7</Code>} />
          <ParamRow label="Einheit" value="ml/min/kg" />
          <ParamRow label="Basis" value="Manuelles FTP (wenn gesetzt) oder geschätztes FTP; Gewicht aus Einstellungen" />
        </InfoBox>
      </Section>

      {/* ── HR-Zonen ── */}
      <Section title="Zeit in Zonen – Herzfrequenz">
        <p>5 Zonen basierend auf % HRmax. HRmax = globales Maximum aller Aktivitäten.</p>
        <InfoBox>
          {HR_ZONES.map(({ zone, range, color }) => (
            <div key={zone} className="flex gap-3 items-center text-sm">
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: color }} />
              <span className="text-foreground w-44 shrink-0">{zone}</span>
              <Code>{range} HRmax</Code>
            </div>
          ))}
          <div className="flex gap-3 mt-2 pt-2 border-t border-border text-sm">
            <span className="text-muted-foreground w-52 shrink-0">Zeitdelta-Cap</span>
            <span>Max. <Code>10 s</Code> zwischen aufeinanderfolgenden Track-Punkten (verhindert Lücken-Artefakte)</span>
          </div>
        </InfoBox>
      </Section>

      {/* ── Power-Zonen ── */}
      <Section title="Zeit in Zonen – Leistung (Coggan)">
        <p>7 Zonen nach Coggan, basierend auf % FTP. FTP = manueller Wert (Einstellungen) oder Schätzung.</p>
        <InfoBox>
          {POWER_ZONES.map(({ zone, range, color }) => (
            <div key={zone} className="flex gap-3 items-center text-sm">
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: color }} />
              <span className="text-foreground w-44 shrink-0">{zone}</span>
              <Code>{range} FTP</Code>
            </div>
          ))}
        </InfoBox>
      </Section>

      {/* ── PMC / Form-Kurve ── */}
      <Section title="Form-Kurve – CTL / ATL / TSB (PMC)">
        <p>
          Performance Management Chart auf Basis von hrTSS (Heart Rate Training Stress Score).
          Alle Ride- und Workout-Typen fließen ein.
        </p>
        <InfoBox>
          <SubSection title="hrTSS" color="border-muted">
            <p><span className="text-muted-foreground">Formel:</span> <Code>hrTSS = (Dauer_h) × (avg_HR / Schwellen-HR)² × 100</Code></p>
            <p><span className="text-muted-foreground">Schwellen-HR:</span> <Code>0.85 × HRmax</Code> (global max; Fallback: 185 bpm)</p>
            <p><span className="text-muted-foreground">Ohne HR:</span> <Code>hrTSS = Dauer_h × 50</Code></p>
          </SubSection>
          <SubSection title="CTL – Fitness (Chronic Training Load)" color="border-blue-700">
            <p><span className="text-muted-foreground">Methode:</span> Exponentieller gleitender Mittelwert über <strong>42 Tage</strong></p>
            <p><span className="text-muted-foreground">Formel:</span> <Code>CTL = CTL_prev + (2/43) × (TSS − CTL_prev)</Code></p>
          </SubSection>
          <SubSection title="ATL – Müdigkeit (Acute Training Load)" color="border-orange-700">
            <p><span className="text-muted-foreground">Methode:</span> Exponentieller gleitender Mittelwert über <strong>7 Tage</strong></p>
            <p><span className="text-muted-foreground">Formel:</span> <Code>ATL = ATL_prev + (2/8) × (TSS − ATL_prev)</Code></p>
          </SubSection>
          <SubSection title="TSB – Form (Training Stress Balance)" color="border-muted">
            <p><Code>TSB = CTL − ATL</Code></p>
            <p><span className="text-muted-foreground">Positiv:</span> frisch / ausgeruht – <span className="text-muted-foreground">Negativ:</span> ermüdet</p>
          </SubSection>
        </InfoBox>
      </Section>

      {/* ── Streckenvergleich ── */}
      <Section title="Streckenvergleich – Ähnlichkeit">
        <p>
          Findet Aktivitäten mit ähnlichem Startpunkt und ähnlicher Distanz.
          Kein geometrisches Track-Matching (kein Fréchet / Hausdorff).
        </p>
        <InfoBox>
          <ParamRow label="Startpunkt-Radius" value={<>Standard <Code>2 km</Code> (Haversine-Distanz)</>} />
          <ParamRow label="Distanztoleranz" value={<>Standard <Code>±20 %</Code> der Referenz-Distanz</>} />
          <ParamRow label="Track-Vereinfachung" value={<>RDP-Toleranz <Val v={`${COMPARISON_SIMPLIFY} m`} /> (höher als Detailansicht – Performance)</>} />
          <ParamRow label="Ergebnis-Limit" value="Max. 10 ähnliche Aktivitäten" />
        </InfoBox>
      </Section>

      {/* ── Allgemeines ── */}
      <Section title="Allgemeines">
        <InfoBox>
          <ParamRow
            label="Datumsfeld"
            value={<><Code>start_date</Code> (UTC) – Anzeige via Browser-Zeitzone oder fixem Offset aus Einstellungen umgerechnet</>}
          />
          <ParamRow label="Geschwindigkeit" value={<>Alle API-Werte in m/s, Anzeige in km/h (<Code>× 3.6</Code>)</>} />
          <ParamRow label="Distanz" value={<>Alle API-Werte in Metern, Anzeige in km (<Code>/ 1000</Code>)</>} />
          <ParamRow label="Datenbank" value={<>SQLite, Zeitvergleiche via <Code>julianday()</Code> und <Code>strftime()</Code></>} />
        </InfoBox>
      </Section>
    </div>
  );
}
