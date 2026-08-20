import { useTranslation } from 'react-i18next';
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
  { key: 'z1', range: '0–60 %',   color: '#60a5fa' },
  { key: 'z2', range: '60–70 %',  color: '#4ade80' },
  { key: 'z3', range: '70–80 %',  color: '#facc15' },
  { key: 'z4', range: '80–90 %',  color: '#fb923c' },
  { key: 'z5', range: '90–100 %', color: '#ef4444' },
];

export default function BerechnungenPage() {
  const config = useConfig();
  const { t } = useTranslation('berechnungen');
  return (
    <div className="space-y-10 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('pageTitle')}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t('pageSubtitle')}
        </p>
      </div>

      {/* ── Dashboard – Sparklines ── */}
      <Section title={t('sparklines.sectionTitle')}>
        <p>{t('sparklines.intro')}</p>
        <InfoBox>
          <ParamRow label={t('sparklines.noYearFilterLabel')} value={<>{t('sparklines.noYearFilterPrefix')} <Val v={config.sparkline_weeks} /> {t('sparklines.noYearFilterSuffix')}</>} />
          <ParamRow label={t('sparklines.yearFilterLabel')} value={t('sparklines.yearFilterValue')} />
          <ParamRow label={t('sparklines.weekCalcLabel')} value={<Code>CAST((julianday('now') − julianday(start_date)) / 7 AS INTEGER)</Code>} />
          <ParamRow label={t('sparklines.missingLabel')} value={t('sparklines.missingValue')} />
        </InfoBox>
      </Section>

      {/* ── Karte – Geschwindigkeitsfärbung ── */}
      <Section title={t('mapSpeed.sectionTitle')}>
        <p>{t('mapSpeed.intro')}</p>
        <InfoBox>
          <ParamRow label={t('mapSpeed.bucketsLabel')} value={<><Val v={config.speed_color_buckets} /> {t('mapSpeed.bucketsSuffix')}</>} />
          <ParamRow label={t('mapSpeed.colorModelLabel')} value={<Code>{t('mapSpeed.colorModelFormula')}</Code>} />
          <ParamRow label={t('mapSpeed.minMaxLabel')} value={t('mapSpeed.minMaxValue')} />
          <ParamRow label={t('mapSpeed.segmentationLabel')} value={t('mapSpeed.segmentationValue')} />
          <ParamRow label={t('mapSpeed.simplifyLabel')} value={<>{t('mapSpeed.simplifyPrefix')} <Val v={`${config.track_simplify_m} m`} /> {t('mapSpeed.simplifySuffix')}</>} />
        </InfoBox>
      </Section>

      {/* ── Aktivitätsprofile ── */}
      <Section title={t('profiles.sectionTitle')}>
        <InfoBox>
          <SubSection title={t('profiles.elevation.title')}>
            <p><span className="text-muted-foreground">{t('labels.yAxis')}</span> {t('profiles.elevation.yAxisValue')}</p>
            <p><span className="text-muted-foreground">{t('profiles.elevation.gainLabel')}</span> <Code>Σ max(0, alt[i] − alt[i−1])</Code> {t('profiles.elevation.gainSuffix')}</p>
            <p><span className="text-muted-foreground">{t('profiles.elevation.zeroFilterLabel')}</span> {t('profiles.elevation.zeroFilterValue')}</p>
          </SubSection>
          <SubSection title={t('profiles.speed.title')}>
            <p><span className="text-muted-foreground">{t('labels.yAxis')}</span> {t('profiles.speed.yAxisValue')}</p>
            <p><span className="text-muted-foreground">{t('labels.average')}</span> {t('profiles.speed.avgValue')}</p>
          </SubSection>
          <SubSection title={t('profiles.hr.title')}>
            <p><span className="text-muted-foreground">{t('labels.yAxis')}</span> {t('profiles.hr.yAxisValue')}</p>
            <p><span className="text-muted-foreground">{t('labels.average')}</span> {t('profiles.hr.avgValue')}</p>
          </SubSection>
          <SubSection title={t('profiles.combined.title')}>
            <p><span className="text-muted-foreground">{t('profiles.combined.normLabel')}</span> {t('profiles.combined.normSuffix')} <Code>(v − min) / (max − min)</Code></p>
            <p><span className="text-muted-foreground">{t('profiles.combined.gapsLabel')}</span> {t('profiles.combined.gapsValue')}</p>
          </SubSection>
        </InfoBox>
      </Section>

      {/* ── Bezier-Glättung ── */}
      <Section title={t('bezier.sectionTitle')}>
        <p>{t('bezier.intro')}</p>
        <InfoBox>
          <ParamRow label={t('bezier.methodLabel')} value={t('bezier.methodValue')} />
          <ParamRow label={t('bezier.tensionLabel')} value={<><Val v={config.bezier_tension} /> {t('bezier.tensionSuffix')}</>} />
          <ParamRow label={t('bezier.controlPointsLabel')} value={<Code>cp1 = P[i] + (P[i+1] − P[i−1]) · T</Code>} />
          <ParamRow label={t('bezier.endpointsLabel')} value={t('bezier.endpointsValue')} />
          <ParamRow label={t('bezier.gapsLabel')} value={t('bezier.gapsValue')} />
        </InfoBox>
      </Section>

      {/* ── Jahresfortschritt ── */}
      <Section title={t('yearProgress.sectionTitle')}>
        <InfoBox>
          <SubSection title={t('yearProgress.cumulative.title')}>
            <p><span className="text-muted-foreground">{t('yearProgress.cumulative.xAxisLabel')}</span> {t('yearProgress.cumulative.xAxisValue')}</p>
            <p><span className="text-muted-foreground">{t('yearProgress.cumulative.yValueLabel')}</span> {t('yearProgress.cumulative.yValueValue')}</p>
            <p><span className="text-muted-foreground">{t('yearProgress.cumulative.todayLabel')}</span> <Code>⌊(now − 1. Jan) / 86 400 000 ms⌋</Code></p>
          </SubSection>
          <SubSection title={t('yearProgress.forecast.title')}>
            <p><span className="text-muted-foreground">{t('labels.method')}</span> {t('yearProgress.forecast.methodValue')}</p>
            <p><span className="text-muted-foreground">{t('labels.formula')}</span> <Code>Prognose = (km_heute / Jahrestag_heute) × 365</Code></p>
            <p><span className="text-muted-foreground">{t('yearProgress.forecast.assumptionLabel')}</span> {t('yearProgress.forecast.assumptionPrefix')} <em>{t('yearProgress.forecast.assumptionEmphasis')}</em> {t('yearProgress.forecast.assumptionSuffix')}</p>
          </SubSection>
        </InfoBox>
      </Section>

      {/* ── HR-Zonen ── */}
      <Section title={t('hrZones.sectionTitle')}>
        <p>{t('hrZones.intro')}</p>
        <InfoBox>
          {HR_ZONES.map(({ key, range, color }) => (
            <div key={key} className="flex gap-3 items-center text-sm">
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: color }} />
              <span className="text-foreground w-44 shrink-0">{t(`hrZones.zones.${key}`)}</span>
              <Code>{range} HRmax</Code>
            </div>
          ))}
          <div className="flex gap-3 mt-2 pt-2 border-t border-border text-sm">
            <span className="text-muted-foreground w-52 shrink-0">{t('hrZones.timeDeltaCapLabel')}</span>
            <span>{t('labels.max')} <Code>10 s</Code> {t('hrZones.timeDeltaCapSuffix')}</span>
          </div>
        </InfoBox>
      </Section>

      {/* ── PMC / Form-Kurve ── */}
      <Section title={t('pmc.sectionTitle')}>
        <p>
          {t('pmc.intro')}
        </p>
        <InfoBox>
          <SubSection title={t('pmc.hrtss.title')} color="border-muted">
            <p><span className="text-muted-foreground">{t('labels.formula')}</span> <Code>hrTSS = (Dauer_h) × (avg_HR / Schwellen-HR)² × 100</Code></p>
            <p><span className="text-muted-foreground">{t('pmc.hrtss.thresholdLabel')}</span> <Code>0.85 × HRmax</Code> {t('pmc.hrtss.thresholdSuffix')}</p>
            <p><span className="text-muted-foreground">{t('pmc.hrtss.noHrLabel')}</span> <Code>hrTSS = Dauer_h × 50</Code></p>
          </SubSection>
          <SubSection title={t('pmc.ctl.title')} color="border-blue-700">
            <p><span className="text-muted-foreground">{t('labels.method')}</span> {t('pmc.ctl.methodPrefix')} <strong>{t('pmc.ctl.methodDays')}</strong></p>
            <p><span className="text-muted-foreground">{t('labels.formula')}</span> <Code>CTL = CTL_prev + (2/43) × (TSS − CTL_prev)</Code></p>
          </SubSection>
          <SubSection title={t('pmc.atl.title')} color="border-orange-700">
            <p><span className="text-muted-foreground">{t('labels.method')}</span> {t('pmc.atl.methodPrefix')} <strong>{t('pmc.atl.methodDays')}</strong></p>
            <p><span className="text-muted-foreground">{t('labels.formula')}</span> <Code>ATL = ATL_prev + (2/8) × (TSS − ATL_prev)</Code></p>
          </SubSection>
          <SubSection title={t('pmc.tsb.title')} color="border-muted">
            <p><Code>TSB = CTL − ATL</Code></p>
            <p><span className="text-muted-foreground">{t('pmc.tsb.positiveLabel')}</span> {t('pmc.tsb.positiveValue')} <span className="text-muted-foreground">{t('pmc.tsb.negativeLabel')}</span> {t('pmc.tsb.negativeValue')}</p>
          </SubSection>
        </InfoBox>
      </Section>

      {/* ── Streckenvergleich ── */}
      <Section title={t('routeCompare.sectionTitle')}>
        <p>
          {t('routeCompare.intro')}
        </p>
        <InfoBox>
          <ParamRow label={t('routeCompare.startRadiusLabel')} value={<>{t('labels.standard')} <Code>2 km</Code> {t('routeCompare.startRadiusSuffix')}</>} />
          <ParamRow label={t('routeCompare.distanceToleranceLabel')} value={<>{t('labels.standard')} <Code>±3 %</Code> {t('routeCompare.distanceToleranceSuffix')}</>} />
          <ParamRow label={t('routeCompare.corridorLabel')} value={<>{t('routeCompare.corridorPrefix')} <Code>2 km</Code> {t('routeCompare.corridorMiddle')} <Code>500 m</Code></>} />
          <ParamRow label={t('routeCompare.minMatchLabel')} value={<>{t('labels.standard')} <Code>85 %</Code> {t('routeCompare.minMatchSuffix')}</>} />
          <ParamRow label={t('routeCompare.seriesRuleLabel')} value={t('routeCompare.seriesRuleValue')} />
          <ParamRow label={t('routeCompare.simplifyLabel')} value={<>{t('routeCompare.simplifyPrefix')} <Val v={`${config.comparison_simplify} m`} /> {t('routeCompare.simplifySuffix')}</>} />
          <ParamRow label={t('routeCompare.resultLimitLabel')} value={t('routeCompare.resultLimitValue')} />
        </InfoBox>
      </Section>

      {/* ── Allgemeines ── */}
      <Section title={t('general.sectionTitle')}>
        <InfoBox>
          <ParamRow
            label={t('general.dateFieldLabel')}
            value={<><Code>start_date</Code> {t('general.dateFieldSuffix')}</>}
          />
          <ParamRow label={t('general.speedLabel')} value={<>{t('general.speedPrefix')}<Code>× 3.6</Code>)</>} />
          <ParamRow label={t('general.distanceLabel')} value={<>{t('general.distancePrefix')}<Code>/ 1000</Code>)</>} />
          <ParamRow label={t('general.dbLabel')} value={<>{t('general.dbPrefix')} <Code>julianday()</Code> {t('general.dbMiddle')} <Code>strftime()</Code></>} />
        </InfoBox>
      </Section>
    </div>
  );
}
