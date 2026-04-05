import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart, Bar, Line, ComposedChart, XAxis, YAxis,
  Tooltip as RechartsTooltip, ResponsiveContainer,
} from 'recharts';
import { format, subDays } from 'date-fns';
import { ChevronRight } from 'lucide-react';
import PageHeader from '@/components/PageHeader';

/* ─── Types ─── */
interface EmilyRun {
  id: string;
  started_at: string;
  status: string;
  generated_count: number;
  failed_count: number;
  estimated_cost_usd: number | null;
  error_message: string | null;
}

type CountOrNull = number | null; // null = query failed

interface PipelineCounts {
  queue: CountOrNull;
  generating: CountOrNull;
  awaiting: CountOrNull;
  approved: CountOrNull;
  published: CountOrNull;
}

interface ChannelStatus {
  name: string;
  enabled: boolean;
}

const PIPELINE_STAGES = [
  { key: 'queue', label: 'Queue', route: '/approvals' },
  { key: 'generating', label: 'Generating', route: '/dashboard' },
  { key: 'awaiting', label: 'Awaiting Approval', route: '/approvals' },
  { key: 'approved', label: 'Approved', route: '/approvals' },
  { key: 'published', label: 'Published', route: '/approvals' },
] as const;

const CHANNEL_KEYS = [
  { name: 'Blog', configKey: 'channel_blog' },
  { name: 'AEO', configKey: 'channel_aeo' },
  { name: 'Email', configKey: 'channel_email' },
  { name: 'Social', configKey: 'channel_social' },
  { name: 'SMS', configKey: 'channel_sms' },
];

export default function Analytics() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [runs, setRuns] = useState<EmilyRun[]>([]);
  const [allRuns, setAllRuns] = useState<EmilyRun[]>([]);
  const [counts, setCounts] = useState<PipelineCounts>({ queue: null, generating: null, awaiting: null, approved: null, published: null });
  const [published30d, setPublished30d] = useState<CountOrNull>(null);
  const [channels, setChannels] = useState<ChannelStatus[]>([]);
  const [publishedToggle, setPublishedToggle] = useState<'all' | '30d'>('all');

  const fetchAll = useCallback(async () => {
    const sevenAgo = subDays(new Date(), 7).toISOString();
    const thirtyAgo = subDays(new Date(), 30).toISOString();

    const [
      runsRes, allRunsRes,
      queueRes, generatingRes, awaitingRes, approvedRes,
      publishedAllRes, pub30Res,
      configRes,
    ] = await Promise.all([
      supabase.from('emily_runs').select('*').gte('started_at', sevenAgo).order('started_at', { ascending: true }),
      supabase.from('emily_runs').select('*').order('started_at', { ascending: false }).limit(5),
      // FIX 1: Queue from mkt_seo_queue pending (seo_content_queue doesn't exist)
      supabase.from('mkt_seo_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      // Generating: emily_runs currently running
      supabase.from('emily_runs').select('id', { count: 'exact', head: true }).eq('status', 'running'),
      // Awaiting approval: emily_content_items pending/awaiting_approval
      supabase.from('mkt_seo_queue').select('id', { count: 'exact', head: true }).eq('status', 'generated'),
      // Approved but not published
      supabase.from('mkt_seo_queue').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
      // Published all time
      supabase.from('mkt_seo_queue').select('id', { count: 'exact', head: true }).eq('status', 'published'),
      // Published last 30 days
      supabase.from('mkt_seo_queue').select('id', { count: 'exact', head: true }).eq('status', 'published').gte('updated_at', thirtyAgo),
      // FIX 2: Channel config from correct keys
      supabase.from('app_config').select('key, value').in('key', CHANNEL_KEYS.map(c => c.configKey)),
    ]);

    if (runsRes.data) setRuns(runsRes.data);
    if (allRunsRes.data) setAllRuns(allRunsRes.data);

    // Show null (→ "—") when a query errored, otherwise the count (which may be 0)
    setCounts({
      queue: queueRes.error ? null : (queueRes.count ?? 0),
      generating: generatingRes.error ? null : (generatingRes.count ?? 0),
      awaiting: awaitingRes.error ? null : (awaitingRes.count ?? 0),
      approved: approvedRes.error ? null : (approvedRes.count ?? 0),
      published: publishedAllRes.error ? null : (publishedAllRes.count ?? 0),
    });

    setPublished30d(pub30Res.error ? null : (pub30Res.count ?? 0));

    // Parse channel statuses from app_config
    const configMap: Record<string, string> = {};
    configRes.data?.forEach((r: any) => { configMap[r.key] = r.value; });
    setChannels(CHANNEL_KEYS.map(ch => ({
      name: ch.name,
      enabled: configMap[ch.configKey] === 'true',
    })));

    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Chart data
  const chartData = (() => {
    const days: Record<string, { date: string; runs: number; cost: number; generated: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = format(subDays(new Date(), i), 'yyyy-MM-dd');
      days[d] = { date: format(subDays(new Date(), i), 'EEE'), runs: 0, cost: 0, generated: 0 };
    }
    runs.forEach(r => {
      const d = r.started_at.split('T')[0];
      if (days[d]) { days[d].runs++; days[d].cost += r.estimated_cost_usd || 0; days[d].generated += r.generated_count || 0; }
    });
    return Object.values(days);
  })();

  const totalGenerated = runs.reduce((s, r) => s + (r.generated_count || 0), 0);
  const totalCost = runs.reduce((s, r) => s + (r.estimated_cost_usd || 0), 0);

  const displayCounts = {
    ...counts,
    published: publishedToggle === '30d' ? published30d : counts.published,
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-[1400px]">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-[1400px]">
      <PageHeader title="Pipeline" description="Content flow from queue to published — see where everything is right now." />

      {/* ═══ SECTION 1: PIPELINE STATUS ═══ */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Pipeline Status</h2>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>Published:</span>
            <button
              onClick={() => setPublishedToggle('all')}
              className={`px-2 py-0.5 rounded text-xs transition-colors ${publishedToggle === 'all' ? 'bg-primary/20 text-primary font-medium' : 'hover:text-foreground'}`}
            >
              All time
            </button>
            <button
              onClick={() => setPublishedToggle('30d')}
              className={`px-2 py-0.5 rounded text-xs transition-colors ${publishedToggle === '30d' ? 'bg-primary/20 text-primary font-medium' : 'hover:text-foreground'}`}
            >
              30 days
            </button>
          </div>
        </div>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between gap-2 overflow-x-auto">
              {PIPELINE_STAGES.map((stage, i) => {
                const count = displayCounts[stage.key as keyof PipelineCounts];
                const isBroken = count === null;
                const hasItems = count !== null && count > 0;
                return (
                  <div key={stage.key} className="flex items-center gap-2 flex-1 min-w-0">
                    <button
                      onClick={() => navigate(stage.route)}
                      className={`flex-1 flex flex-col items-center gap-2 rounded-lg border-2 px-3 py-4 transition-all hover:scale-[1.02] cursor-pointer min-w-[120px] ${
                        isBroken
                          ? 'border-destructive/40 bg-destructive/5'
                          : hasItems
                            ? 'border-emerald-500/40 bg-emerald-500/5'
                            : 'border-border bg-secondary/30'
                      }`}
                    >
                      <span className={`text-2xl font-bold tabular-nums ${
                        isBroken ? 'text-destructive' : hasItems ? 'text-emerald-400' : 'text-muted-foreground'
                      }`}>
                        {isBroken ? '—' : count.toLocaleString()}
                      </span>
                      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-center leading-tight">
                        {stage.label}
                      </span>
                    </button>
                    {i < PIPELINE_STAGES.length - 1 && (
                      <ChevronRight size={16} className="text-muted-foreground/40 shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ═══ SECTION 2: RECENT ACTIVITY ═══ */}
      <section className="space-y-6">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Recent Activity</h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Emily Run Log */}
          <div className="space-y-4">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Emily Activity & Cost (7 Days)</h3>
            <div className="flex gap-6 text-sm">
              <span className="text-muted-foreground">Generated: <strong className="text-foreground">{totalGenerated}</strong></span>
              <span className="text-muted-foreground">Cost: <strong className="text-foreground">${totalCost.toFixed(2)}</strong></span>
            </div>
            <Card>
              <CardContent className="p-4">
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData}>
                      <XAxis dataKey="date" tick={{ fill: 'hsl(215, 9%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis yAxisId="left" tick={{ fill: 'hsl(215, 9%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fill: 'hsl(215, 9%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <RechartsTooltip contentStyle={{ background: 'hsl(215, 22%, 11%)', border: '1px solid hsl(215, 14%, 16%)', borderRadius: 8, color: 'hsl(213, 14%, 80%)', fontSize: 12 }} />
                      <Bar yAxisId="left" dataKey="runs" fill="hsl(212, 100%, 67%)" radius={[4, 4, 0, 0]} barSize={24} name="Runs" />
                      <Line yAxisId="right" type="monotone" dataKey="cost" stroke="hsl(27, 87%, 61%)" strokeWidth={2} dot={{ r: 3 }} name="Cost ($)" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Last 5 runs table */}
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wide">
                    <th className="px-4 py-2.5">Started</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Gen</th><th className="px-4 py-2.5">Failed</th><th className="px-4 py-2.5">Cost</th>
                  </tr></thead>
                  <tbody>{allRuns.map(r => (
                    <tr key={r.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2.5 text-xs text-foreground">{format(new Date(r.started_at), 'd MMM HH:mm')}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline" className={`text-[10px] ${r.status === 'complete' || r.status === 'success' ? 'text-success border-success/30' : r.status === 'running' ? 'text-primary border-primary/30' : 'text-destructive border-destructive/30'}`}>{r.status}</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-foreground">{r.generated_count}</td>
                      <td className="px-4 py-2.5 text-xs text-foreground">{r.failed_count}</td>
                      <td className="px-4 py-2.5 text-xs text-foreground">${(r.estimated_cost_usd || 0).toFixed(2)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </CardContent>
            </Card>
          </div>

          {/* Channel Activity */}
          <div className="space-y-4">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Channel Status</h3>
            <Card>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {channels.map(ch => (
                    <div key={ch.name} className="px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`inline-block h-2.5 w-2.5 rounded-full shrink-0 ${ch.enabled ? 'bg-success' : 'bg-muted-foreground/40'}`} />
                        <span className="text-sm text-foreground">{ch.name}</span>
                      </div>
                      <span className={`text-xs ${ch.enabled ? 'text-success' : 'text-muted-foreground'}`}>
                        {ch.enabled ? 'Active' : 'Paused'}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <p className="text-xs text-muted-foreground italic">
              Channel toggles are managed in <button onClick={() => navigate('/operations')} className="text-primary hover:underline">Controls</button>.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
