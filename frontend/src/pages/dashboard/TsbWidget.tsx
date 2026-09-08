import { useTranslation } from 'react-i18next';

import type { PmcDay } from '@/lib/api';

function tsbInfo(tsb: number, t: (key: string) => string): { label: string; text: string; color: string; bg: string } {
  if (tsb >= 10)  return { label: t('tsb.status.fresh.label'),     text: t('tsb.status.fresh.text'),     color: '#22c55e', bg: 'rgba(34,197,94,0.07)'  };
  if (tsb >= 0)   return { label: t('tsb.status.recovered.label'), text: t('tsb.status.recovered.text'), color: '#3b82f6', bg: 'rgba(59,130,246,0.07)' };
  if (tsb >= -10) return { label: t('tsb.status.tired.label'),     text: t('tsb.status.tired.text'),     color: '#f59e0b', bg: 'rgba(245,158,11,0.07)' };
  return              { label: t('tsb.status.exhausted.label'), text: t('tsb.status.exhausted.text'), color: '#ef4444', bg: 'rgba(239,68,68,0.07)'  };
}

export function TsbWidget({ current }: { current: PmcDay }) {
  const { t } = useTranslation('dashboard');
  const info = tsbInfo(current.tsb, t);
  const tsbStr = current.tsb > 0 ? `+${current.tsb}` : String(current.tsb);
  return (
    <div
      className="rounded-2xl border px-5 py-4 flex items-center justify-between gap-4 flex-wrap"
      style={{ borderColor: `${info.color}50`, background: info.bg }}
    >
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">
          {t('tsb.title')}
        </p>
        <p className="text-sm font-semibold" style={{ color: info.color }}>{info.label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{info.text}</p>
      </div>
      <div className="flex items-center gap-6 shrink-0">
        <div className="text-center">
          <p className="text-2xl font-black tabular-nums" style={{ color: info.color }}>{tsbStr}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">TSB</p>
        </div>
        <div className="text-center">
          <p className="text-xl font-bold tabular-nums text-foreground">{Math.round(current.ctl)}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">CTL</p>
        </div>
        <div className="text-center">
          <p className="text-xl font-bold tabular-nums text-foreground">{Math.round(current.atl)}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">ATL</p>
        </div>
      </div>
    </div>
  );
}
