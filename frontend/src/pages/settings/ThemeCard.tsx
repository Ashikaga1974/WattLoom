import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTheme, type ThemeChoice } from '@/lib/theme-context';

const OPTIONS: ThemeChoice[] = ['light', 'dark', 'system'];

export function ThemeCard() {
  const { t: ts } = useTranslation('settings');
  const { theme, setTheme } = useTheme();

  return (
    <Card>
      <CardHeader className="border-b border-border pb-3">
        <CardTitle className="text-sm font-semibold">{ts('theme.title')}</CardTitle>
        <p className="text-xs text-muted-foreground">{ts('theme.hint')}</p>
      </CardHeader>
      <CardContent className="pt-5">
        <div className="inline-flex rounded-md border border-input overflow-hidden">
          {OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setTheme(option)}
              className={`px-4 py-2 text-sm transition-colors ${
                theme === option
                  ? 'bg-orange-500 text-white'
                  : 'bg-background hover:bg-muted text-foreground'
              }`}
            >
              {ts(`theme.options.${option}`)}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
