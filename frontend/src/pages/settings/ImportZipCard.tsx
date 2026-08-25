import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type ImportStatus = 'idle' | 'running' | 'done' | 'error';

function logLineClass(line: string): string {
  if (line.startsWith('ERR') || line.startsWith('FEHLER')) return 'text-red-500';
  if (line.startsWith('WARN')) return 'text-yellow-500';
  if (line.startsWith('Import abgeschlossen')) return 'text-green-500';
  return 'text-muted-foreground';
}

export function ImportZipCard({
  importStatus, importLog, importZip, importConfirm,
  onImportClick, onStartImport, onCancelConfirm,
}: {
  importStatus: ImportStatus;
  importLog: string[];
  importZip: string | null;
  importConfirm: boolean;
  onImportClick: () => void;
  onStartImport: () => void;
  onCancelConfirm: () => void;
}) {
  const { t } = useTranslation('common');
  const { t: ts } = useTranslation('settings');

  return (
    <Card>
      <CardHeader className="border-b border-border pb-3">
        <CardTitle className="text-sm font-semibold">{ts('import.title')}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {ts('import.subtitlePrefix')}{' '}
          <code className="bg-muted px-1 rounded text-foreground text-xs">download/</code>
          {' '}{ts('import.subtitleSuffix')}
        </p>
      </CardHeader>
      <CardContent className="pt-5 space-y-4">
        {importConfirm ? (
          <div className="rounded-lg border border-orange-500/40 bg-orange-500/10 p-4 space-y-3">
            <p className="text-sm font-medium text-orange-600 dark:text-orange-400">
              {ts('import.confirmTitle')}
            </p>
            <p className="text-xs text-muted-foreground">
              {ts('import.confirmTextIntro')}
              {' '}{ts('import.confirmTextBeforeStrong')} <strong>{ts('import.confirmTextStrong')}</strong>{ts('import.confirmTextAfterStrong')}
            </p>
            <div className="flex gap-3">
              <button
                onClick={onStartImport}
                className="rounded-md px-4 py-1.5 text-xs font-medium bg-orange-500 hover:bg-orange-600 text-white transition-colors cursor-pointer"
              >
                {ts('import.importAnyway')}
              </button>
              <button
                onClick={onCancelConfirm}
                className="rounded-md px-4 py-1.5 text-xs font-medium border border-border hover:bg-muted transition-colors cursor-pointer"
              >
                {t('actions.cancel')}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4 flex-wrap">
            <button
              onClick={onImportClick}
              disabled={importStatus === 'running'}
              className="rounded-md px-5 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-white cursor-pointer"
            >
              {importStatus === 'running' ? ts('import.running') : ts('import.startButton')}
            </button>
            {importZip && (
              <span className="text-xs text-muted-foreground font-mono">{importZip}</span>
            )}
            {importStatus === 'done' && <span className="text-sm text-green-600">{ts('import.done')}</span>}
            {importStatus === 'error' && <span className="text-sm text-red-500">{ts('import.error')}</span>}
          </div>
        )}

        {importLog.length > 0 && (
          <div className="rounded-lg border border-border bg-muted/40 p-3 max-h-56 overflow-y-auto font-mono text-xs space-y-0.5 leading-relaxed">
            {importLog.map((line, i) => (
              <div key={i} className={logLineClass(line)}>{line}</div>
            ))}
            {importStatus === 'running' && (
              <div className="text-muted-foreground/40 animate-pulse">…</div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
