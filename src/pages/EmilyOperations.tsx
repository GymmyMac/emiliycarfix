import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  ChartContainer, ChartTooltip, ChartTooltipContent,
} from '@/components/ui/chart';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
import {
  Activity, TrendingUp, Zap, Brain,
  Globe, FileText, MapPin, BookOpen,
  Video, MessageCircle as Reddit, Twitter,
  Power, AlertTriangle, CreditCard,
  CircleDot, Send as SendIcon, Workflow,
} from 'lucide-react';
import { format, subDays } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import PipelineCanvas from '@/components/PipelineCanvas';

/* ─── Types ─── */
interface GA4Row {
  date: string;
  sessions: number;
  conversions: number;
  slug?: string;
}

interface FeatureFlag {
  id: string;
  flag_key: string;
  flag_value: boolean;
  label?: string;
}

interface SeoQueueItem {
  id: string;
  title: string;
  status: string;
  priority_score: number | null;
}

interface ContentQueueItem {
  id: string;
  content_type: string;
  draft_copy: string;
  status: string;
  platform?: string;
}

/* ─── Initiative config ─── */
const MASTER_FLAGS = [
  { key: 'emily_global_active', label: 'Emily Autopilot', icon: Power, color: 'text-emily' },
];

const CONTENT_FLAGS = [
  { key: 'initiative_sku_aeo_enrichment', label: 'SKU Enrichment', icon: Zap },
  { key: 'initiative_seo_decision_pages', label: 'Decision Buying Guides', icon: FileText },
  { key: 'initiative_seo_regional_pages', label: 'NZ Regional SEO', icon: MapPin },
  { key: 'initiative_ai_articles', label: 'Deep-Dive Articles', icon: BookOpen },
];

const CHANNEL_FLAGS = [
  { key: 'emily_gen_tiktok_script', label: 'TikTok Strategy', icon: Video },
  { key: 'emily_gen_reddit_post', label: 'Reddit Community', icon: Reddit },
  { key: 'emily_gen_x_post', label: 'X/Twitter Feed', icon: Twitter },
];

const STATUS_DOT: Record<string, string> = {
  queued: '🔴',
  briefed: '🟡',
  in_draft: '🟡',
  pending_review: '🟡',
  approved: '🟢',
  scheduled: '🟢',
  published: '🟢',
};

/* ─── Chart config ─── */
const chartConfig = {
  sessions: { label: 'Sessions', color: 'hsl(214 100% 40%)' },
  conversions: { label: 'Conversions', color: 'hsl(142 71% 45%)' },
};

export default function EmilyOperations() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [ga4Data, setGa4Data] = useState<GA4Row[]>([]);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [flagIds, setFlagIds] = useState<Record<string, string>>({});
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ running: number; total: number }>({ running: 0, total: 0 });
  const [avgConfidence, setAvgConfidence] = useState<number | null>(null);
  const [seoQueue, setSeoQueue] = useState<SeoQueueItem[]>([]);
  const [contentQueue, setContentQueue] = useState<ContentQueueItem[]>([]);
  const [aeoFilter, setAeoFilter] = useState(false);

  const fetchAll = useCallback(async () => {
    const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');

    const [ga4Res, flagsRes, runsRes, confidenceRes, seoRes, contentRes] = await Promise.all([
      supabase.from('mkt_ga4_daily_summary').select('*').gte('date', thirtyDaysAgo).order('date'),
      supabase.from('feature_flags').select('*'),
      supabase.from('emily_runs').select('id, status'),
      supabase.from('part_enrichment_staging').select('confidence_score').not('confidence_score', 'is', null),
      supabase.from('mkt_seo_queue').select('id, title, status, priority_score').order('priority_score', { ascending: false }).limit(15),
      supabase.from('mkt_content_queue').select('id, content_type, draft_copy, status, platform').in('status', ['pending', 'approved']).limit(15),
    ]);

    // GA4
    if (ga4Res.data) setGa4Data(ga4Res.data);

    // Feature flags
    if (flagsRes.data) {
      const fm: Record<string, boolean> = {};
      const fi: Record<string, string> = {};
      flagsRes.data.forEach((f: FeatureFlag) => {
        fm[f.flag_key] = f.flag_value;
        fi[f.flag_key] = f.id;
      });
      setFlags(fm);
      setFlagIds(fi);
    }

    // Batch progress
    if (runsRes.data) {
      const running = runsRes.data.filter((r: any) => r.status === 'running').length;
      setBatchProgress({ running, total: runsRes.data.length });
    }

    // Confidence
    if (confidenceRes.data && confidenceRes.data.length > 0) {
      const avg = confidenceRes.data.reduce((s: number, r: any) => s + (r.confidence_score || 0), 0) / confidenceRes.data.length;
      setAvgConfidence(avg);
    }

    // Queues
    if (seoRes.data) setSeoQueue(seoRes.data);
    if (contentRes.data) setContentQueue(contentRes.data);

    setLoading(false);
  }, []);

  // OpenRouter balance
  const fetchCredits = useCallback(async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const jwt = sessionData?.session?.access_token;
      if (!jwt) return;
      const res = await fetch('https://flpzjbasdsfwoeruyxgp.supabase.co/functions/v1/check-openrouter-balance', {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCreditBalance(data.balance ?? data.credits ?? null);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchAll();
    fetchCredits();
    const interval = setInterval(fetchAll, 60_000);
    return () => clearInterval(interval);
  }, [fetchAll, fetchCredits]);

  const toggleFlag = async (key: string, newValue: boolean) => {
    // Optimistic
    setFlags((prev) => ({ ...prev, [key]: newValue }));
    const { error } = await supabase
      .from('feature_flags')
      .update({ enabled: newValue })
      .eq('flag_key', key);
    if (error) {
      setFlags((prev) => ({ ...prev, [key]: !newValue }));
      toast({ title: 'Failed to update', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `${key} ${newValue ? 'enabled' : 'disabled'}` });
    }
  };

  // GA4 derived metrics
  const filteredGA4 = aeoFilter ? ga4Data.filter((r) => r.slug?.includes('/aeo/')) : ga4Data;
  const totalSessions = filteredGA4.reduce((s, r) => s + (r.sessions || 0), 0);
  const totalConversions = filteredGA4.reduce((s, r) => s + (r.conversions || 0), 0);
  const avgConvRate = totalSessions > 0 ? ((totalConversions / totalSessions) * 100).toFixed(2) : '0';
  const aiReferrals = ga4Data.filter((r) => r.slug?.includes('/aeo/')).reduce((s, r) => s + (r.sessions || 0), 0);

  const chartData = filteredGA4.map((r) => ({
    date: format(new Date(r.date), 'dd MMM'),
    sessions: r.sessions || 0,
    conversions: r.conversions || 0,
  }));

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl text-emily flex items-center gap-2">
          <Brain size={24} /> Emily Operations
        </h1>
        <p className="text-xs text-muted-foreground">Holistic control &amp; growth visibility</p>
      </div>

      <Tabs defaultValue="controls" className="w-full">
        <TabsList>
          <TabsTrigger value="controls">Controls</TabsTrigger>
          <TabsTrigger value="pipeline" className="flex items-center gap-1.5">
            <Workflow size={14} /> Pipeline
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline" className="mt-4">
          <PipelineCanvas />
        </TabsContent>

        <TabsContent value="controls" className="mt-4 space-y-6">

      {/* ═══════ 1. GROWTH INSIGHTS ═══════ */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Growth Insights</h2>
          <button
            onClick={() => setAeoFilter(!aeoFilter)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${aeoFilter ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
          >
            {aeoFilter ? 'AEO Only' : 'All Pages'}
          </button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Activity size={20} className="text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{aeoFilter ? 'AEO' : 'Total'} Sessions (30d)</p>
                <p className="text-xl font-bold text-foreground">{totalSessions.toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
                <TrendingUp size={20} className="text-success" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Avg. Conversion Rate</p>
                <p className="text-xl font-bold text-foreground">{avgConvRate}%</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emily/10 flex items-center justify-center">
                <Zap size={20} className="text-emily" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">AI Referral Traffic</p>
                <p className="text-xl font-bold text-foreground">{aiReferrals.toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Line chart */}
        {chartData.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <ChartContainer config={chartConfig} className="h-[240px] w-full">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line type="monotone" dataKey="sessions" stroke="var(--color-sessions)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="conversions" stroke="var(--color-conversions)" strokeWidth={2} dot={false} />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}
      </section>

      {/* ═══════ 2. OPERATIONAL CONTROL CENTER ═══════ */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Marketing Initiatives</h2>

        {/* Master switch */}
        {MASTER_FLAGS.map((f) => (
          <Card key={f.key} className="border-emily/30">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-emily/10 flex items-center justify-center">
                  <f.icon size={20} className="text-emily" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{f.label}</p>
                  <p className="text-xs text-muted-foreground">Master control</p>
                </div>
              </div>
              <Switch
                checked={flags[f.key] ?? false}
                onCheckedChange={(v) => toggleFlag(f.key, v)}
              />
            </CardContent>
          </Card>
        ))}

        {/* Content initiatives */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CONTENT_FLAGS.map((f) => (
            <Card key={f.key}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <f.icon size={18} className="text-primary shrink-0" />
                  <span className="text-sm text-foreground">{f.label}</span>
                </div>
                <Switch
                  checked={flags[f.key] ?? false}
                  onCheckedChange={(v) => toggleFlag(f.key, v)}
                />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Channel controls */}
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide pt-1">Channel Controls</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {CHANNEL_FLAGS.map((f) => (
            <Card key={f.key}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <f.icon size={16} className="text-muted-foreground shrink-0" />
                  <span className="text-sm text-foreground">{f.label}</span>
                </div>
                <Switch
                  checked={flags[f.key] ?? false}
                  onCheckedChange={(v) => toggleFlag(f.key, v)}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ═══════ 3. CREDIT & HEALTH ═══════ */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Credit &amp; Health</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* OpenRouter */}
          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <CreditCard size={16} className="text-primary" />
                <span className="text-xs font-medium text-muted-foreground">OpenRouter Credits</span>
              </div>
              {creditBalance !== null ? (
                <p className="text-xl font-bold text-foreground">${creditBalance.toFixed(2)}</p>
              ) : (
                <Badge variant="secondary" className="text-xs">Unavailable</Badge>
              )}
            </CardContent>
          </Card>

          {/* Batch Progress */}
          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <CircleDot size={16} className="text-emily" />
                <span className="text-xs font-medium text-muted-foreground">Batch Progress</span>
              </div>
              <p className="text-sm text-foreground">{batchProgress.running} running / {batchProgress.total} total</p>
              <Progress value={batchProgress.total > 0 ? (batchProgress.running / batchProgress.total) * 100 : 0} className="h-2" />
            </CardContent>
          </Card>

          {/* Quality Alert */}
          <Card className={avgConfidence !== null && avgConfidence < 0.7 ? 'border-destructive/50' : ''}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                {avgConfidence !== null && avgConfidence < 0.7 ? (
                  <AlertTriangle size={16} className="text-destructive" />
                ) : (
                  <TrendingUp size={16} className="text-success" />
                )}
                <span className="text-xs font-medium text-muted-foreground">Avg. Confidence</span>
              </div>
              <p className="text-xl font-bold text-foreground">
                {avgConfidence !== null ? avgConfidence.toFixed(2) : '—'}
              </p>
              {avgConfidence !== null && avgConfidence < 0.7 && (
                <Badge variant="destructive" className="text-xs">Below threshold</Badge>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ═══════ 4. QUEUE MANAGEMENT ═══════ */}
      <section className="space-y-4 pb-8">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Queue Management</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* SEO Queue */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">SEO Queue</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-1.5 max-h-72 overflow-y-auto">
              {seoQueue.length === 0 && <p className="text-xs text-muted-foreground">No items</p>}
              {seoQueue.map((item) => (
                <button
                  key={item.id}
                  onClick={() => navigate('/dashboard')}
                  className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-left hover:bg-accent transition-colors"
                >
                  <span className="text-sm text-foreground line-clamp-1 flex-1">{item.title || 'Untitled'}</span>
                  <span className="text-base shrink-0 ml-2">{STATUS_DOT[item.status] || '⚪'}</span>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Social / Content Queue */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Social Queue</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-1.5 max-h-72 overflow-y-auto">
              {contentQueue.length === 0 && <p className="text-xs text-muted-foreground">No items</p>}
              {contentQueue.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground line-clamp-1">{item.draft_copy || item.content_type}</p>
                    <p className="text-[10px] text-muted-foreground">{item.status}</p>
                  </div>
                  <button
                    onClick={async () => {
                      toast({ title: 'Publish to Buffer triggered', description: 'Workflow initiated.' });
                    }}
                    className="ml-2 shrink-0 flex items-center gap-1 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
                  >
                    <SendIcon size={12} /> Buffer
                  </button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
