import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart, Bar, Line, ComposedChart, XAxis, YAxis,
  Tooltip as RechartsTooltip, ResponsiveContainer,
} from 'recharts';
import { format, subDays } from 'date-fns';
import { ArrowRight, ChevronRight } from 'lucide-react';
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

interface PipelineCounts {
  queue: number;
  generating: number;
  awaiting: number;
  approved: number;
  published: number;
}

interface ChannelStatus {
  name: string;
  configKey: string;
  enabled: boolean;
}

const PIPELINE_STAGES = [
  { key: 'queue', label: 'Queue', route: '/approvals' },
  { key: 'generating', label: 'Generating', route: '/dashboard' },
  { key: 'awaiting', label: 'Awaiting Approval', route: '/approvals' },
  { key: 'approved', label: 'Approved', route: '/approvals' },
  { key: 'published', label: 'Published', route: '/approvals' },
] as const;

const CHANNELS: { name: string; configKey: string }[] = [
  { name: 'Blog / AEO', configKey: 'feature_sku_aeo_enrichment' },
  { name: 'Social', configKey: 'feature_social_content' },
  { name: 'Email & SMS', configKey: 'feature_email_sms' },
];

export default function Analytics() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [runs, setRuns] = useState<EmilyRun[]>([]);
  const [allRuns, setAllRuns] = useState<EmilyRun[]>([]);
  const [counts, setCounts] = useState<PipelineCounts>({ queue: 0, generating: 0, awaiting: 0, approved: 0, published: 0 });
  const [channels, setChannels] = useState<ChannelStatus[]>([]);
  const [publishedToggle, setPublishedToggle] = useState<'all' | '30d'>('all');

  const fetchAll = useCallback(async () => {
    const sevenAgo = subDays(new Date(), 7).toISOString();
    const thirtyAgo = subDays(new Date(), 30).toISOString();

    const [
      runsRes, allRunsRes,
      queueRes, generatingRes, awaitingRes, approvedRes,
      publishedAllRes, published30Res,
      configRes,
    ] = await Promise.all([
      supabase.from('emily_runs').select('*').gte('started_at', sevenAgo).order('started_at', { ascending: true }),
      supabase.from('emily_runs').select('*').order('started_at', { ascending: false }).limit(5),
      // Queue: seo_content_queue pending
      supabase.from('seo_content_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      // Generating: emily_runs currently running
      supabase.from('emily_runs').select('id', { count: 'exact', head: true }).eq('status', 'running'),
      // Awaiting approval: mkt_seo_queue generated but not approved
      supabase.from('mkt_seo_queue').select('id', { count: 'exact', head: true }).eq('status', 'generated'),
      // Approved but not published
      supabase.from('mkt_seo_queue').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
      // Published all time
      supabase.from('mkt_seo_queue').select('id', { count: 'exact', head: true }).eq('status', 'published'),
      // Published last 30 days
      supabase.from('mkt_seo_queue').select('id', { count: 'exact', head: true }).eq('status', 'published').gte('updated_at', thirtyAgo),
      // Channel config
      supabase.from('app_config').select('key, value').in('key', CHANNELS.map(c => c.configKey)),
    ]);

    if (runsRes.data) setRuns(runsRes.data);
    if (allRunsRes.data) setAllRuns(allRunsRes.data);

    setCounts({
      queue: queueRes.count || 0,
      generating: generatingRes.count || 0,
      awaiting: awaitingRes.count || 0,
      approved: approvedRes.count || 0,
      published: publishedAllRes.count || 0,
    });

    // Store both counts for toggle
    (window as any).__published30d = published30Res.count || 0;

    // Parse channel statuses from app_config
    const configMap: Record<string, string> = {};
    configRes.data?.forEach((r: any) => { configMap[r.key] = r.value; });
    setChannels(CHANNELS.map(ch => ({
      name: ch.name,
      configKey: ch.configKey,
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

  const displayedPublished = publishedToggle === '30d' ? ((window as any).__published30d || 0) : counts.published;
  const displayCounts = { ...counts, published: displayedPublished };

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
                const hasItems = count > 0;
                return (
                  <div key={stage.key} className="flex items-center gap-2 flex-1 min-w-0">
                    <button
                      onClick={() => navigate(stage.route)}
                      className={`flex-1 flex flex-col items-center gap-2 rounded-lg border-2 px-3 py-4 transition-all hover:scale-[1.02] cursor-pointer min-w-[120px] ${
                        hasItems
                          ? 'border-emerald-500/40 bg-emerald-500/5'
                          : 'border-border bg-secondary/30'
                      }`}
                    >
                      <span className={`text-2xl font-bold tabular-nums ${hasItems ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                        {count.toLocaleString()}
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
                        <Badge variant="outline" className={`text-[10px] ${r.status === 'success' ? 'text-success border-success/30' : 'text-destructive border-destructive/30'}`}>{r.status}</Badge>
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
            <div className="space-y-3">
              {channels.map(ch => (
                <Card key={ch.name}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">{ch.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {ch.configKey === 'feature_sku_aeo_enrichment' && 'AEO article enrichment & publishing'}
                        {ch.configKey === 'feature_social_content' && 'Social media content generation'}
                        {ch.configKey === 'feature_email_sms' && 'Email and SMS campaign generation'}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        ch.enabled
                          ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                          : 'text-muted-foreground border-border'
                      }`}
                    >
                      {ch.enabled ? 'Active' : 'Off'}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
            <p className="text-xs text-muted-foreground italic">
              Channel toggles are managed in <button onClick={() => navigate('/operations')} className="text-primary hover:underline">Controls</button>.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
