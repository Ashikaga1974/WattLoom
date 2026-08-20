import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  years?: string[] | number[];
  selectedYear?: string | number | null;
  onYearChange?: (year: string | null) => void;
  children?: React.ReactNode;
}

export function PageHeader({ title, subtitle, years, selectedYear, onYearChange, children }: PageHeaderProps) {
  const { t } = useTranslation('common');
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        {years && years.length > 0 && onYearChange && (
          <Select
            value={selectedYear !== null && selectedYear !== undefined ? String(selectedYear) : 'all'}
            onValueChange={onYearChange}
          >
            <SelectTrigger className="w-28 h-8 text-sm">
              <SelectValue>
                {selectedYear !== null && selectedYear !== undefined && String(selectedYear) !== 'all'
                  ? String(selectedYear)
                  : t('allYears')}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('allYears')}</SelectItem>
              {years.map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {children}
      </div>
    </div>
  );
}
