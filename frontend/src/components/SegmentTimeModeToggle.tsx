import { useTranslation } from 'react-i18next';
import type { SegmentTimeMode } from '@/lib/segment-time-mode';

interface SegmentTimeModeToggleProps {
  mode: SegmentTimeMode;
  onChange: (mode: SegmentTimeMode) => void;
}

export function SegmentTimeModeToggle({ mode, onChange }: SegmentTimeModeToggleProps) {
  const { t } = useTranslation('segments');
  return (
    <div className="flex rounded-lg overflow-hidden border border-border text-sm" title={t('timeMode.movingHint')}>
      {(['elapsed', 'moving'] as SegmentTimeMode[]).map(m => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={[
            'px-3 py-1.5 transition-colors',
            mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
          ].join(' ')}
        >
          {t(`timeMode.${m}`)}
        </button>
      ))}
    </div>
  );
}
