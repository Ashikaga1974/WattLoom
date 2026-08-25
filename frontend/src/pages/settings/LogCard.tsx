import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function LogCard() {
  const { t: ts } = useTranslation('settings');
  const [logLines, setLogLines] = useState<string[] | null>(null);
  const [logLoading, setLogLoading] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);

  async function fetchLog() {
    setLogLoading(true);
    setLogError(null);
    try {
      const res = await api.getLog();
      setLogLines(res.lines);
    } catch (e) {
      setLogError(e instanceof Error ? e.message : ts('common.unknownError'));
    } finally {
      setLogLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="border-b border-border pb-3">
        <CardTitle className="text-sm font-semibold">{ts('log.title')}</CardTitle>
        <p className="text-xs text-muted-foreground">{ts('log.subtitle')}</p>
      </CardHeader>
      <CardContent className="pt-5 space-y-4">
        <button
          onClick={fetchLog}
          disabled={logLoading}
          className="rounded-md px-5 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-white cursor-pointer"
        >
          {logLoading ? ts('log.loading') : ts('log.fetchButton')}
        </button>
        {logError && <p className="text-xs text-red-500">{logError}</p>}
        {logLines !== null && (
          <pre className="text-xs font-mono bg-muted rounded-md p-3 max-h-[32rem] overflow-auto whitespace-pre-wrap">
            {logLines.length > 0 ? logLines.join('\n') : ts('log.empty')}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}
