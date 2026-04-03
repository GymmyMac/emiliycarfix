import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart, Bar, Line, ComposedChart, XAxis, YAxis,
  Tooltip as RechartsTooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { format, subDays } from 'date-fns';

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

export default function Analytics() {
  const [loading, setLoading] = useState(true);
  const [runs, setRuns] = useState<EmilyRun[]>([]);
  const [allRuns, setAllRuns] = useState<EmilyRun[]>([]);
  const [funnelData, setFunnelData] = useState({ queued: 0, generated: 0, approved: 0, published: 0 });
  const [categoryData, setCategoryData] = useState<{ category: string; count: number }[]>([]);
  const [libraryStats, setLibraryStats] = useState({ published: 0, inQueue: 0, linked: 0, total: 0 });

  const fetchAll = useCallback(async () => {
    const sevenAgo = subDays(new Date(), 7).toISOString();

    const [runsRes, allRunsRes, queuedRes, generatedRes, approvedRes, publishedRes, categoryRes, linkedRes, totalRes] = await Promise.all([
      supabase.from('emily_runs').select('*').gte('started_at', sevenAgo).order('started_at', { ascending: true }),
      supabase.from('emily_runs').select('*').order('started_at', { ascending: false }).limit(5),
      supabase.from('mkt_seo_queue').select('id', { count: 'exact', head: true }).eq('status', 'queued'),
      supabase.from('mkt_seo_queue').select('id', { count: 'exact', head: true }).not('draft_content', 'is', null).eq('james_approved', false),
      supabase.from('mkt_seo_queue').select('id', { count: 'exact', head: true }).eq('james_approved', true),
      supabase.from('mkt_seo_queue').select('id', { count: 'exact', head: true }).eq('status', 'published'),
      supabase.from('mkt_seo_queue').select('category').not('category', 'is', null),
      supabase.from('mkt_seo_queue').select('id', { count: 'exact', head: true }).not('related_slugs', 'is', null),
      supabase.from('mkt_seo_queue').select('id', { count: 'exact', head: true }),
    ]);

    if (runsRes.data) setRuns(runsRes.data);
    if (allRunsRes.data) setAllRuns(allRunsRes.data);

    const q = (queuedRes.count || 0) + (generatedRes.count || 0);
    setFunnelData({
      queued: q,
      generated: generatedRes.count || 0,
      approved: approvedRes.count || 0,
      published: publishedRes.count || 0,
    });

    setLibraryStats({
      published: publishedRes.count || 0,
      inQueue: totalRes.count || 0,
      linked: linkedRes.count || 0,
      total: totalRes.count || 0,
    });

    // Category distribution
    if (categoryRes.data) {
      const cats: Record<string, number> = {};
      categoryRes.data.forEach((r: any) => { const c = r.category || 'Uncategorized'; cats[c] = (cats[c] || 0) + 1; });
      setCategoryData(Object.entries(cats).map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count));
    }

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

  // Funnel chart
  const funnelChartData = [
    { stage: 'Queued', count: funnelData.queued },
    { stage: 'Generated', count: funnelData.generated },
    { stage: 'Approved', count: funnelData.approved },
    { stage: 'Published', count: funnelData.published },
  ];
  const funnelTotal = Math.max(funnelData.queued, 1);

  if (loading) {
    return (
      <div className="space-y-6 max-w-[1400px]">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-80" /><Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-[1400px]">
      <h1 className="text-2xl font-bold text-foreground">Analytics</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ═══ PANEL 1: EMILY PERFORMANCE ═══ */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Emily Activity & Cost Trend (7 Days)</h2>
          <div className="flex gap-6 text-sm">
            <span className="text-muted-foreground">Total generated: <strong className="text-foreground">{totalGenerated}</strong></span>
            <span className="text-muted-foreground">Total cost: <strong className="text-foreground">${totalCost.toFixed(2)}</strong></span>
          </div>
          <Card>
            <CardContent className="p-4">
              <div className="h-[220px]">
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
        </section>

        {/* ═══ PANEL 2: CONTENT PIPELINE FUNNEL ═══ */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Content Pipeline Status</h2>
          <Card>
            <CardContent className="p-4">
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={funnelChartData} layout="vertical">
                    <XAxis type="number" tick={{ fill: 'hsl(215, 9%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="stage" tick={{ fill: 'hsl(213, 14%, 80%)', fontSize: 12 }} axisLine={false} tickLine={false} width={80} />
                    <RechartsTooltip contentStyle={{ background: 'hsl(215, 22%, 11%)', border: '1px solid hsl(215, 14%, 16%)', borderRadius: 8, color: 'hsl(213, 14%, 80%)', fontSize: 12 }} />
                    <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={28}>
                      {funnelChartData.map((entry, i) => (
                        <Cell key={i} fill={['hsl(212, 100%, 67%)', 'hsl(267, 79%, 71%)', 'hsl(142, 58%, 49%)', 'hsl(142, 58%, 49%)'][i]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                {funnelChartData.map(f => (
                  <span key={f.stage}>{f.stage}: <strong className="text-foreground">{f.count}</strong> ({Math.round((f.count / funnelTotal) * 100)}%)</span>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Channel Performance placeholder */}
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide pt-4">Channel Activity (Last 7 Days)</h2>
          <Card>
            <CardContent className="p-4">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="py-2">Channel</th><th className="py-2">Posts</th><th className="py-2">Engagement</th><th className="py-2">Status</th>
                </tr></thead>
                <tbody>
                  {['Facebook', 'Instagram', 'TikTok', 'Email', 'SMS', 'Blog/AEO'].map(ch => (
                    <tr key={ch} className="border-b border-border last:border-0">
                      <td className="py-2 text-foreground">{ch}</td>
                      <td className="py-2 text-muted-foreground">—</td>
                      <td className="py-2 text-muted-foreground">—</td>
                      <td className="py-2"><Badge variant="outline" className="text-[10px] text-muted-foreground border-border">Not connected</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </section>
      </div>

      {/* ═══ PANEL 4: AEO LIBRARY STATUS ═══ */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">AEO Article Library Progress</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 space-y-2">
              <p className="text-xs text-muted-foreground">Published</p>
              <p className="text-2xl font-bold text-foreground">{libraryStats.published} <span className="text-sm text-muted-foreground font-normal">/ 50</span></p>
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div className="h-full rounded-full bg-success transition-all" style={{ width: `${(libraryStats.published / 50) * 100}%` }} />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 space-y-2">
              <p className="text-xs text-muted-foreground">In Queue</p>
              <p className="text-2xl font-bold text-foreground">{libraryStats.inQueue}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 space-y-2">
              <p className="text-xs text-muted-foreground">Internal Links Populated</p>
              <p className="text-2xl font-bold text-foreground">{libraryStats.linked} <span className="text-sm text-muted-foreground font-normal">/ {libraryStats.total}</span></p>
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${libraryStats.total > 0 ? (libraryStats.linked / libraryStats.total) * 100 : 0}%` }} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Category distribution */}
        {categoryData.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categoryData.slice(0, 10)} layout="vertical">
                    <XAxis type="number" tick={{ fill: 'hsl(215, 9%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="category" tick={{ fill: 'hsl(213, 14%, 80%)', fontSize: 11 }} axisLine={false} tickLine={false} width={120} />
                    <RechartsTooltip contentStyle={{ background: 'hsl(215, 22%, 11%)', border: '1px solid hsl(215, 14%, 16%)', borderRadius: 8, color: 'hsl(213, 14%, 80%)', fontSize: 12 }} />
                    <Bar dataKey="count" fill="hsl(212, 100%, 67%)" radius={[0, 4, 4, 0]} barSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-muted-foreground italic">
          Note: As of April 3, 2026, no articles have been published. The {libraryStats.inQueue} items in queue are staged and awaiting approval flow completion. Internal linking (related_slugs population) is pending and must be completed before publishing.
        </p>
      </section>
    </div>
  );
}
