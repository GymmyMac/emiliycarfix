import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Target, Loader2, AlertTriangle, BarChart3 } from 'lucide-react';
import { differenceInDays, format, parseISO } from 'date-fns';

interface CIContext {
  keywords_analysed?: number;
  queue_entries_added?: number;
  top_priority_keyword?: string;
}

export default function TargetAnalysisPanel() {
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [context, setContext] = useState<CIContext | null>(null);
  const [running, setRunning] = useState(false);

  const fetchStatus = useCallback(async () => {
    const { data } = await supabase
      .from('app_config')
      .select('key, value')
      .in('key', ['emily_ci_queue_seeded', 'competitor_intelligence_context']);

    data?.forEach((row: { key: string; value: string }) => {
      if (row.key === 'emily_ci_queue_seeded') setLastRun(row.value);
      if (row.key === 'competitor_intelligence_context') {
        try { setContext(JSON.parse(row.value)); } catch { setContext(null); }
      }
    });
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const isStale = !lastRun || differenceInDays(new Date(), parseISO(lastRun)) > 35;

  const handleRun = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('build-keyword-targets');
      if (error) throw new Error(error.message || 'Analysis failed');

      const result = data?.result;
      toast.success(`Target analysis complete — ${result?.inserted ?? 0} queue entries added, ${result?.skipped ?? 0} skipped.`);

      const today = format(new Date(), 'yyyy-MM-dd');
      await supabase.from('app_config').upsert(
        { key: 'emily_ci_queue_seeded', value: today, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );

      await fetchStatus();
    } catch (err: any) {
      toast.error(err.message || 'Analysis failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card className="border-primary/20 bg-secondary/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Target size={18} className="text-primary" />
          Target Analysis
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* Left: status */}
          <div className="space-y-2 flex-1">
            <p className="text-sm text-muted-foreground">
              Last run:{' '}
              <span className="text-foreground font-medium">
                {lastRun ? format(parseISO(lastRun), 'd MMMM yyyy') : 'Never'}
              </span>
            </p>

            {isStale && (
              <div className="flex items-center gap-2 text-amber-500 text-xs">
                <AlertTriangle size={14} />
                <span>Analysis is out of date — re-run after uploading fresh keyword data</span>
              </div>
            )}

            {context && (
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground mt-1">
                <span className="flex items-center gap-1">
                  <BarChart3 size={12} />
                  Keywords analysed: <span className="text-foreground font-medium">{context.keywords_analysed?.toLocaleString() ?? '—'}</span>
                </span>
                <span>
                  Queue entries added: <span className="text-foreground font-medium">{context.queue_entries_added?.toLocaleString() ?? '—'}</span>
                </span>
                <span>
                  Top priority: <span className="text-foreground font-medium">{context.top_priority_keyword ?? '—'}</span>
                </span>
              </div>
            )}
          </div>

          {/* Right: action */}
          <div className="flex flex-col items-center gap-1 shrink-0">
            <Button onClick={handleRun} disabled={running} size="lg">
              {running ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Running analysis…
                </>
              ) : (
                'Run Target Analysis'
              )}
            </Button>
            <span className="text-xs text-muted-foreground">Analyses competitor keywords and seeds Emily's queue</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
