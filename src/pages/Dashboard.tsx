import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { fetchAppConfig, type AppConfig } from '@/lib/appConfig';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
  AlertTriangle, CheckCircle2, XCircle, Info, Clock,
  ArrowRight, Zap, RefreshCw,
} from 'lucide-react';
import { format, formatDistanceToNow, subDays } from 'date-fns';
import {
  BarChart, Bar, Line, ComposedChart, XAxis, YAxis,
  Tooltip as RechartsTooltip, ResponsiveContainer,
} from 'recharts';

interface EmilyRun {
  id: string;
  started_at: string;
  status: string;
  generated_count: number;
  failed_count: number;
  estimated_cost_usd: number | null;
  error_message: string | null;
}

interface OpenRouterSnapshot {
  checked_at: string;
  credits_remaining_usd: number | null;
  usage_usd: number | null;
  limit_usd: number | null;
  is_low_balance: boolean | null;
}

const PHASE_CONFIG: Record<string, { color: string; cssVar: string; desc: string }> = {
  FORM: { color: 'hsl(var(--phase-form))', cssVar: 'phase-form', desc: 'Foundational architecture & brand definition' },
  LOAD: { color: 'hsl(var(--phase-load))', cssVar: 'phase-load', desc: 'Cold awareness & narrative disruption pipeline' },
  LAUNCH: { color: 'hsl(var(--phase-launch))', cssVar: 'phase-launch', desc: 'Market entry & channel activation' },
  STORM: { color: 'hsl(var(--phase-storm))', cssVar: 'phase-storm', desc: 'Aggressive growth & conversion optimization' },
  PERFORM: { color: 'hsl(var(--phase-perform))', cssVar: 'phase-perform', desc: 'Scale, retention & advocacy loops' },
};

const STREAM_CONFIG = [
  { key: 'disrupt', label: 'DISRUPT', color: 'hsl(var(--stream-disrupt))' },
  { key: 'educate', label: 'EDUCATE', color: 'hsl(var(--stream-educate))' },
  { key: 'convert', label: 'CONVERT', color: 'hsl(var(--stream-convert))' },
  { key: 'amplify', label: 'AMPLIFY', color: 'hsl(var(--stream-amplify))' },
];

const CHANNEL_CONFIG = [
  { key: 'channel_facebook', label: 'Facebook' },
  { key: 'channel_instagram', label: 'Instagram' },
  { key: 'channel_tiktok', label: 'TikTok' },
  { key: 'channel_email', label: 'Email' },
  { key: 'channel_sms', label: 'SMS' },
  { key: 'channel_blog', label: 'Blog' },
  { key: 'channel_aeo', label: 'AEO' },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [pendingArticles, setPendingArticles] = useState(0);
  const [pendingSocial, setPendingSocial] = useState(0);
  const [lastRun, setLastRun] = useState<EmilyRun | null>(null);
  const [lastSuccessRun, setLastSuccessRun] = useState<EmilyRun | null>(null);
  const [orSnapshot, setOrSnapshot] = useState<OpenRouterSnapshot | null>(null);
  const [channels, setChannels] = useState<Record<string, boolean>>({});
  const [recentRuns, setRecentRuns] = useState<EmilyRun[]>([]);
  const [april1Dismissed, setApril1Dismissed] = useState(() => {
    const d = localStorage.getItem('dismiss_april1');
    if (!d) return false;
    return Date.now() - parseInt(d) < 7 * 24 * 60 * 60 * 1000;
  });

  const fetchAll = useCallback(async () => {
    const channelKeys = CHANNEL_CONFIG.map(c => c.key);
    const [
      appConfig, articlesRes, socialRes, lastRunRes, lastSuccessRes,
      orRes, channelsRes, runsRes,
    ] = await Promise.all([
      fetchAppConfig(),
      supabase.from('mkt_seo_queue').select('id', { count: 'exact', head: true }).eq('james_approved', false).not('draft_content', 'is', null),
      supabase.from('mkt_content_queue').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
      supabase.from('emily_runs').select('*').order('started_at', { ascending: false }).limit(1),
      supabase.from('emily_runs').select('*').eq('status', 'success').order('started_at', { ascending: false }).limit(1),
      supabase.from('emily_openrouter_snapshots').select('*').order('checked_at', { ascending: false }).limit(1),
      supabase.from('app_config').select('key, value').in('key', channelKeys),
      supabase.from('emily_runs').select('*').gte('started_at', subDays(new Date(), 7).toISOString()).order('started_at', { ascending: true }),
    ]);

    if (appConfig) setConfig(appConfig);
    setPendingArticles(articlesRes.count || 0);
    setPendingSocial(socialRes.count || 0);
    if (lastRunRes.data?.[0]) setLastRun(lastRunRes.data[0]);
    if (lastSuccessRes.data?.[0]) setLastSuccessRun(lastSuccessRes.data[0]);
    if (orRes.data?.[0]) setOrSnapshot(orRes.data[0]);
    if (channelsRes.data) {
      const cm: Record<string, boolean> = {};
      channelsRes.data.forEach((row: { key: string; value: string }) => {
        cm[row.key] = row.value === 'true';
      });
      setChannels(cm);
    }
    if (runsRes.data) setRecentRuns(runsRes.data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Realtime for emily_runs
  useEffect(() => {
    const ch = supabase.channel('dash-runs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'emily_runs' }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchAll]);

  const handleChannelToggle = async (key: string, label: string, checked: boolean) => {
    // Optimistic update
    setChannels(prev => ({ ...prev, [key]: checked }));

    const { error } = await supabase
      .from('app_config')
      .upsert({ key, value: String(checked), updated_at: new Date().toISOString() }, { onConflict: 'key' });

    if (error) {
      // Revert on failure
      setChannels(prev => ({ ...prev, [key]: !checked }));
      toast.error(`Failed to update ${label}`);
    } else {
      toast.success(`${label} ${checked ? 'enabled' : 'disabled'}`);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-[1400px]">
        <Skeleton className="h-20 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-24" /><Skeleton className="h-24" />
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  const phase = config?.business_phase?.toUpperCase() || 'LOAD';
  const phaseConf = PHASE_CONFIG[phase] || PHASE_CONFIG.LOAD;
  const weights = {
    disrupt: config?.stream_weight_disrupt ?? 0,
    educate: config?.stream_weight_educate ?? 0,
    convert: config?.stream_weight_convert ?? 0,
    amplify: config?.stream_weight_amplify ?? 0,
  };
  const weightSum = weights.disrupt + weights.educate + weights.convert + weights.amplify;

  // Build attention items
  const attentionItems: { type: string; badge: string; badgeColor: string; text: string; cta: string; link: string; timestamp: string }[] = [];

  if (pendingArticles > 0) {
    attentionItems.push({
      type: 'approval', badge: 'AEO', badgeColor: 'bg-info/20 text-info',
      text: `${pendingArticles} article${pendingArticles > 1 ? 's' : ''} awaiting approval`,
      cta: 'Review Now', link: '/approvals', timestamp: '',
    });
  }
  if (pendingSocial > 0) {
    attentionItems.push({
      type: 'approval', badge: 'SOCIAL', badgeColor: 'bg-warning/20 text-warning',
      text: `${pendingSocial} social & campaign item${pendingSocial > 1 ? 's' : ''} waiting`,
      cta: 'Review Now', link: '/approvals', timestamp: '',
    });
  }
  if (lastRun?.status === 'failed') {
    attentionItems.push({
      type: 'error', badge: 'ERROR', badgeColor: 'bg-destructive/20 text-destructive',
      text: `Emily's last run failed. Generated: ${lastRun.generated_count}. Failed: ${lastRun.failed_count}.`,
      cta: 'Investigate', link: '/analytics',
      timestamp: lastRun.started_at ? `Run started: ${format(new Date(lastRun.started_at), 'd MMM HH:mm')}` : '',
    });
  }
  if (lastSuccessRun && lastSuccessRun.generated_count === 0) {
    attentionItems.push({
      type: 'warning', badge: 'WARNING', badgeColor: 'bg-warning/20 text-warning',
      text: "Emily's last run generated 0 articles. Something's wrong with production.",
      cta: 'Check Emily Ops', link: '/operations',
      timestamp: lastSuccessRun.started_at ? `Run completed: ${format(new Date(lastSuccessRun.started_at), 'd MMM HH:mm')}` : '',
    });
  }
  if (orSnapshot) {
    const isPrepaid = orSnapshot.limit_usd === null;
    if (isPrepaid) {
      // Prepaid account — no warning needed, just informational
    } else if (orSnapshot.credits_remaining_usd !== null && orSnapshot.limit_usd !== null) {
      const pct = orSnapshot.limit_usd > 0 ? (orSnapshot.credits_remaining_usd / orSnapshot.limit_usd) * 100 : 0;
      if (pct < 10) {
        attentionItems.push({
          type: 'error', badge: 'BALANCE', badgeColor: 'bg-destructive/20 text-destructive',
          text: `Critical: OpenRouter balance $${orSnapshot.credits_remaining_usd.toFixed(2)} remaining of $${orSnapshot.limit_usd.toFixed(2)}`,
          cta: 'View Balance', link: '/operations',
          timestamp: orSnapshot.checked_at ? `Last checked: ${format(new Date(orSnapshot.checked_at), 'd MMM HH:mm')}` : '',
        });
      } else if (pct < 30) {
        attentionItems.push({
          type: 'warning', badge: 'BALANCE', badgeColor: 'bg-warning/20 text-warning',
          text: `Low OpenRouter balance: $${orSnapshot.credits_remaining_usd.toFixed(2)} remaining of $${orSnapshot.limit_usd.toFixed(2)}`,
          cta: 'View Balance', link: '/operations',
          timestamp: orSnapshot.checked_at ? `Last checked: ${format(new Date(orSnapshot.checked_at), 'd MMM HH:mm')}` : '',
        });
      }
    }
  }

  // Chart data
  const chartData = (() => {
    const days: Record<string, { date: string; runs: number; generated: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = format(subDays(new Date(), i), 'yyyy-MM-dd');
      days[d] = { date: format(subDays(new Date(), i), 'EEE'), runs: 0, generated: 0 };
    }
    recentRuns.forEach(r => {
      const d = r.started_at.split('T')[0];
      if (days[d]) {
        days[d].runs++;
        days[d].generated += r.generated_count || 0;
      }
    });
    return Object.values(days);
  })();

  const totalGenerated = recentRuns.reduce((s, r) => s + (r.generated_count || 0), 0);
  const totalCost = recentRuns.reduce((s, r) => s + (r.estimated_cost_usd || 0), 0);
  const avgPerRun = recentRuns.length > 0 ? Math.round(totalGenerated / recentRuns.length) : 0;

  // Intelligence feed
  const signals = recentRuns
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
    .slice(0, 5)
    .map(r => ({
      text: `Emily run completed. Generated: ${r.generated_count}, Failed: ${r.failed_count}, Cost: $${(r.estimated_cost_usd || 0).toFixed(2)}`,
      time: r.started_at,
      color: r.generated_count > 0 ? 'text-success' : r.failed_count > 0 ? 'text-destructive' : 'text-warning',
    }));

  return (
    <div className="space-y-8 max-w-[1400px]">
      {/* ═══ PHASE & WEIGHTS STRIP ═══ */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1
              className="text-3xl font-bold tracking-tight animate-pulse-phase"
              style={{ color: phaseConf.color }}
            >
              {phase}
            </h1>
            <span className="text-sm text-muted-foreground">— {phaseConf.desc}</span>
          </div>
        </div>

        <div className="w-full lg:w-[340px] space-y-2">
          {weightSum !== 100 && (
            <Badge className="bg-warning/20 text-warning border-warning/30 text-xs">
              <AlertTriangle size={12} className="mr-1" /> Weights unbalanced ({weightSum}%)
            </Badge>
          )}
          {STREAM_CONFIG.map(s => {
            const w = weights[s.key as keyof typeof weights];
            return (
              <div key={s.key} className="flex items-center gap-2 text-xs">
                <span className="w-20 text-muted-foreground">{s.label}</span>
                <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${w}%`, backgroundColor: s.color }} />
                </div>
                <span className="w-8 text-right text-foreground font-medium">{w}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══ NEEDS YOUR ATTENTION ═══ */}
      <section>
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3">Needs Your Attention</h2>
        {attentionItems.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-foreground">All clear. No attention needed. 😊</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {attentionItems.slice(0, 5).map((item, i) => (
              <Card key={i} className="border-border">
                <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1">
                    <Badge variant="outline" className={`${item.badgeColor} border-transparent text-[11px] font-semibold shrink-0`}>
                      {item.badge}
                    </Badge>
                    <div>
                      <p className="text-sm text-foreground">{item.text}</p>
                      {item.timestamp && <p className="text-xs text-muted-foreground mt-0.5">{item.timestamp}</p>}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => navigate(item.link)} className="shrink-0 h-8 text-xs">
                    {item.cta} <ArrowRight size={12} className="ml-1" />
                  </Button>
                </CardContent>
              </Card>
            ))}
            {attentionItems.length > 5 && (
              <Button variant="ghost" size="sm" onClick={() => navigate('/approvals')} className="text-xs text-muted-foreground">
                View all ({attentionItems.length}) →
              </Button>
            )}
          </div>
        )}

        {/* April 1 dismissible info */}
        {!april1Dismissed && (
          <Card className="mt-3 border-border">
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <Badge variant="outline" className="bg-muted/20 text-muted-foreground border-transparent text-[11px] font-semibold">INFO</Badge>
                <p className="text-sm text-foreground">Note: April 1 produced 0 articles. Root cause under investigation.</p>
              </div>
              <Button size="sm" variant="ghost" className="text-xs text-muted-foreground shrink-0" onClick={() => {
                localStorage.setItem('dismiss_april1', Date.now().toString());
                setApril1Dismissed(true);
              }}>
                Dismiss
              </Button>
            </CardContent>
          </Card>
        )}
      </section>

      {/* ═══ CHANNEL HEALTH GRID ═══ */}
      <section>
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3">Channel Status</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {CHANNEL_CONFIG.map(ch => {
            const isOn = channels[ch.key] ?? false;
            return (
              <Card key={ch.key}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">{ch.label}</span>
                    <Switch
                      checked={isOn}
                      onCheckedChange={(checked) => handleChannelToggle(ch.key, ch.label, checked)}
                    />
                  </div>
                  <p className={`text-xs ${isOn ? 'text-success' : 'text-muted-foreground'}`}>
                    {isOn ? 'Active' : 'Disabled'}
                  </p>
                </CardContent>
              </Card>
            );
          })}
          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Canva</span>
                <Badge variant="outline" className="text-[10px] text-muted-foreground border-border">external</Badge>
              </div>
              <p className="text-xs text-muted-foreground">Visual Design</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ═══ INTELLIGENCE FEED + CHART ═══ */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Intelligence Feed */}
        <div className="xl:col-span-1">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3">Overnight Intelligence</h2>
          <div className="space-y-2">
            {signals.length === 0 ? (
              <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">No recent signals.</p></CardContent></Card>
            ) : (
              signals.map((s, i) => (
                <Card key={i}>
                  <CardContent className="p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <Zap size={12} className={s.color} />
                      <span className="text-[11px] text-muted-foreground">
                        {formatDistanceToNow(new Date(s.time), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-xs text-foreground">{s.text}</p>
                  </CardContent>
                </Card>
              ))
            )}
            {/* Placeholder signals */}
            {['GA4 integration pending', 'Buffer integration pending', 'Bob conversation analysis pending', 'Competitor monitoring pending'].map(p => (
              <Card key={p}><CardContent className="p-3">
                <p className="text-xs text-muted-foreground italic">{p}</p>
              </CardContent></Card>
            ))}
          </div>
        </div>

        {/* Emily Activity Chart */}
        <div className="xl:col-span-2">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3">Emily Activity (Last 7 Days)</h2>
          <Card>
            <CardContent className="p-4">
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData}>
                    <XAxis dataKey="date" tick={{ fill: 'hsl(215, 9%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="left" tick={{ fill: 'hsl(215, 9%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fill: 'hsl(215, 9%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <RechartsTooltip contentStyle={{ background: 'hsl(215, 22%, 11%)', border: '1px solid hsl(215, 14%, 16%)', borderRadius: 8, color: 'hsl(213, 14%, 80%)', fontSize: 12 }} />
                    <Bar yAxisId="left" dataKey="runs" fill="hsl(212, 100%, 67%)" radius={[4, 4, 0, 0]} barSize={32} name="Runs" />
                    <Line yAxisId="right" type="monotone" dataKey="generated" stroke="hsl(142, 58%, 49%)" strokeWidth={2} dot={{ r: 3 }} name="Articles" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="flex gap-6 mt-4 text-xs text-muted-foreground">
                <span>7-day avg: <strong className="text-foreground">{avgPerRun} articles/run</strong></span>
                <span>Total generated: <strong className="text-foreground">{totalGenerated}</strong></span>
                <span>Avg cost/run: <strong className="text-foreground">${recentRuns.length > 0 ? (totalCost / recentRuns.length).toFixed(2) : '0.00'}</strong></span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
