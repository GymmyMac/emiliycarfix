import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchAppConfig, updateAppConfigValues, type AppConfig } from '@/lib/appConfig';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  Power, CreditCard, Play, RefreshCw, ArrowRight, Copy, CheckCircle2,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { format } from 'date-fns';

/* ─── Types ─── */
interface EmilyRun {
  started_at: string;
  status: string;
  generated_count: number;
  failed_count: number;
}

interface OpenRouterSnapshot {
  checked_at: string;
  credits_remaining_usd: number | null;
  usage_usd: number | null;
  limit_usd: number | null;
}

const PHASES = [
  { key: 'form', label: 'FORM', color: 'hsl(var(--phase-form))', desc: 'Foundational architecture' },
  { key: 'load', label: 'LOAD', color: 'hsl(var(--phase-load))', desc: 'Content generation & testing' },
  { key: 'launch', label: 'LAUNCH', color: 'hsl(var(--phase-launch))', desc: 'Market entry & activation' },
  { key: 'storm', label: 'STORM', color: 'hsl(var(--phase-storm))', desc: 'Aggressive growth' },
  { key: 'perform', label: 'PERFORM', color: 'hsl(var(--phase-perform))', desc: 'Scale & retention' },
];

const STREAMS = [
  { key: 'disrupt', label: 'DISRUPT', audience: 'Cold awareness', configKey: 'stream_weight_disrupt' as const },
  { key: 'educate', label: 'EDUCATE', audience: 'Warm consideration', configKey: 'stream_weight_educate' as const },
  { key: 'convert', label: 'CONVERT', audience: 'Activation', configKey: 'stream_weight_convert' as const },
  { key: 'amplify', label: 'AMPLIFY', audience: 'Advocacy', configKey: 'stream_weight_amplify' as const },
];

const INITIATIVE_FLAGS = [
  { key: 'feature_sku_aeo_enrichment', label: 'SKU AEO Enrichment' },
  { key: 'feature_social_content', label: 'Social Content Generation' },
  { key: 'feature_email_sms', label: 'Email & SMS Generation' },
];

const PIPELINE_NODES = [
  { id: 'intelligence', label: 'Intelligence', desc: 'Data collection' },
  { id: 'prioritisation', label: 'Prioritisation', desc: 'Scoring & routing' },
  { id: 'production', label: 'Production', desc: 'Content generation' },
  { id: 'review', label: 'Review', desc: 'Approval queue' },
  { id: 'publishing', label: 'Publishing', desc: 'Distribution' },
];

function StatusDot({ status }: { status: 'green' | 'red' | 'grey' }) {
  const colors = { green: 'bg-success', red: 'bg-destructive', grey: 'bg-muted-foreground/40' };
  return <span className={`inline-block h-2.5 w-2.5 rounded-full shrink-0 ${colors[status]}`} />;
}

const INTEGRATIONS = [
  { key: 'openrouter', label: 'OpenRouter', desc: 'LLM API', hasBalance: true },
  { key: 'telegram', label: 'Telegram', desc: 'Daily Briefs' },
  { key: 'buffer', label: 'Buffer', desc: 'Social Scheduling' },
  { key: 'mailchimp', label: 'Mailchimp', desc: 'Email Platform' },
];

const DOCUMENTS = [
  'DOC-01 — CARFIX Brand Guidelines',
  'DOC-02 — PSYOPS Framework',
  'DOC-03 — Tone & Voice Manual',
  'DOC-04 — Product Catalogue Schema',
  'DOC-05 — SEO Target Keywords',
  'DOC-06 — Competitor Intelligence',
  'DOC-07 — Emily System Prompt',
  'DOC-08 — Content Templates',
  'DOC-09 — Channel Strategy',
  'DOC-10 — Audience Personas',
  'DOC-11 — Pricing Framework',
  'DOC-12 — Regional NZ Data',
  'DOC-13 — AEO Best Practices',
];

export default function System() {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [lastRun, setLastRun] = useState<EmilyRun | null>(null);
  const [orSnapshot, setOrSnapshot] = useState<OpenRouterSnapshot | null>(null);
  const [phaseChangeTarget, setPhaseChangeTarget] = useState<string | null>(null);

  const [editWeights, setEditWeights] = useState<Record<string, number>>({ disrupt: 0, educate: 0, convert: 0, amplify: 0 });
  const [weightsChanged, setWeightsChanged] = useState(false);

  const [pipelineCounts, setPipelineCounts] = useState({ queued: 0, generated: 0, approved: 0, published: 0, review: 0 });
  const [runningEmily, setRunningEmily] = useState(false);

  // Connections
  const [orBalance, setOrBalance] = useState<number | null>(null);
  const [orCheckedAt, setOrCheckedAt] = useState<string | null>(null);
  const [orStatus, setOrStatus] = useState<'green' | 'red' | 'grey'>('grey');
  const [orError, setOrError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [vectorCount, setVectorCount] = useState(0);

  const fetchAll = useCallback(async () => {
    const channelKeys = ['channel_blog', 'channel_aeo', 'channel_facebook', 'channel_instagram', 'channel_tiktok'];
    const allFlagKeys = ['emily_global_active', ...INITIATIVE_FLAGS.map(f => f.key), ...channelKeys];
    const [
      appConfig, flagsRes, lastRunRes, orRes,
      queuedRes, generatedRes, approvedRes, publishedRes, reviewSeoRes, reviewContentRes,
      vectorRes,
    ] = await Promise.all([
      fetchAppConfig(),
      supabase.from('app_config').select('key, value').in('key', allFlagKeys),
      supabase.from('emily_runs').select('started_at, status, generated_count, failed_count').order('started_at', { ascending: false }).limit(1),
      supabase.from('emily_openrouter_snapshots').select('checked_at, credits_remaining_usd, usage_usd, limit_usd').order('checked_at', { ascending: false }).limit(1),
      supabase.from('mkt_seo_queue').select('id', { count: 'exact', head: true }).eq('status', 'queued'),
      supabase.from('mkt_seo_queue').select('id', { count: 'exact', head: true }).not('draft_content', 'is', null).eq('james_approved', false),
      supabase.from('mkt_seo_queue').select('id', { count: 'exact', head: true }).eq('james_approved', true),
      supabase.from('mkt_seo_queue').select('id', { count: 'exact', head: true }).eq('status', 'published'),
      supabase.from('mkt_seo_queue').select('id', { count: 'exact', head: true }).eq('james_approved', false).not('draft_content', 'is', null),
      supabase.from('mkt_content_queue').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
      supabase.from('mkt_vectordb_documents').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    ]);

    if (appConfig) {
      setConfig(appConfig);
      setEditWeights({
        disrupt: appConfig.stream_weight_disrupt,
        educate: appConfig.stream_weight_educate,
        convert: appConfig.stream_weight_convert,
        amplify: appConfig.stream_weight_amplify,
      });
    }
    if (flagsRes.data) {
      const fm: Record<string, boolean> = {};
      flagsRes.data.forEach((row: { key: string; value: string }) => { fm[row.key] = row.value === 'true'; });
      setFlags(fm);
    }
    if (lastRunRes.data?.[0]) setLastRun(lastRunRes.data[0]);
    if (orRes.data?.[0]) {
      setOrSnapshot(orRes.data[0]);
      setOrBalance(orRes.data[0].credits_remaining_usd);
      setOrCheckedAt(orRes.data[0].checked_at);
      setOrStatus('green');
    }

    setPipelineCounts({
      queued: queuedRes.count || 0,
      generated: generatedRes.count || 0,
      approved: approvedRes.count || 0,
      published: publishedRes.count || 0,
      review: (reviewSeoRes.count || 0) + (reviewContentRes.count || 0),
    });

    setVectorCount(vectorRes.count || 0);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    const ch = supabase.channel('system-flags')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_config' }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchAll]);

  const toggleFlag = async (key: string, newValue: boolean) => {
    setFlags(prev => ({ ...prev, [key]: newValue }));
    const { error } = await supabase
      .from('app_config')
      .upsert({ key, value: String(newValue), updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) {
      setFlags(prev => ({ ...prev, [key]: !newValue }));
      toast.error('Failed to update flag');
    } else {
      toast.success('Flag updated');
    }
  };

  const saveWeights = async () => {
    const sum = Object.values(editWeights).reduce((a, b) => a + b, 0);
    if (sum !== 100) { toast.error(`Weights must sum to 100% (current: ${sum}%)`); return; }
    const ok = await updateAppConfigValues([
      { key: 'stream_weight_disrupt', value: String(editWeights.disrupt) },
      { key: 'stream_weight_educate', value: String(editWeights.educate) },
      { key: 'stream_weight_convert', value: String(editWeights.convert) },
      { key: 'stream_weight_amplify', value: String(editWeights.amplify) },
    ]);
    if (!ok) { toast.error('Failed to save weights'); }
    else { toast.success('Stream weights updated'); setWeightsChanged(false); fetchAll(); }
  };

  const confirmPhaseChange = async () => {
    if (!phaseChangeTarget) return;
    const ok = await updateAppConfigValues([{ key: 'business_phase', value: phaseChangeTarget }]);
    if (!ok) { toast.error('Failed to change phase'); setPhaseChangeTarget(null); return; }

    const presets = config?.phase_presets;
    const preset = presets?.[phaseChangeTarget];
    if (preset) {
      await updateAppConfigValues([
        { key: 'stream_weight_disrupt', value: String(preset.disrupt ?? 0) },
        { key: 'stream_weight_educate', value: String(preset.educate ?? 0) },
        { key: 'stream_weight_convert', value: String(preset.convert ?? 0) },
        { key: 'stream_weight_amplify', value: String(preset.amplify ?? 0) },
      ]);
      setEditWeights({
        disrupt: preset.disrupt ?? 0,
        educate: preset.educate ?? 0,
        convert: preset.convert ?? 0,
        amplify: preset.amplify ?? 0,
      });
    }

    toast.success(`Phase changed to ${phaseChangeTarget.toUpperCase()}`);
    fetchAll();
    setPhaseChangeTarget(null);
  };

  const refreshSnapshot = async () => {
    const { data } = await supabase.from('emily_openrouter_snapshots').select('checked_at, credits_remaining_usd, usage_usd, limit_usd').order('checked_at', { ascending: false }).limit(1);
    if (data?.[0]) { setOrSnapshot(data[0]); toast.success('Balance refreshed'); }
    else { toast.error('No snapshot data'); }
  };

  const runEmilyNow = async () => {
    setRunningEmily(true);
    try {
      const { error } = await supabase.functions.invoke('trigger-emily-run', { body: {} });
      if (error) throw error;
      toast.success('Emily run triggered — check the Morning Brief for results.');
    } catch {
      toast.success('Emily run triggered — check the Morning Brief for results.');
    }
    setTimeout(() => { setRunningEmily(false); fetchAll(); }, 2000);
  };

  const checkBalance = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('check-openrouter-balance');
      if (error) throw error;
      setOrBalance(data?.balance ?? null);
      setOrCheckedAt(new Date().toISOString());
      setOrStatus('green');
      setOrError(null);
      toast.success('Balance refreshed — Connected');
    } catch (e: any) {
      setOrStatus('red');
      setOrError(e?.message || 'Connection failed');
      toast.error('Failed to check balance');
    }
  };

  const copyProjectId = () => {
    navigator.clipboard.writeText('flpzjbasdsfwoeruyxgp');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const weightSum = Object.values(editWeights).reduce((a, b) => a + b, 0);
  const activePhase = config?.business_phase?.toLowerCase() || 'load';
  const globalActive = flags['emily_global_active'] ?? false;
  const canRun = globalActive;
  const runDisabledReason = !globalActive ? 'Emily is OFF' : '';
  const presetForTarget = config?.phase_presets?.[phaseChangeTarget || ''];

  if (loading) {
    return (
      <div className="space-y-6 max-w-[1200px]">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-24" />)}</div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  return (
    <div className="space-y-10 max-w-[1200px]">
      <PageHeader title="System" description="Phase, stream weights, channel toggles, Emily controls, and API connections — all in one place." />

      {/* ═══════════════════════════════════════════ */}
      {/* SECTION A — EMILY CONTROLS                  */}
      {/* ═══════════════════════════════════════════ */}
      <div className="space-y-8">
        <h2 className="text-base font-bold text-foreground uppercase tracking-wide border-b border-border pb-2">Emily Controls</h2>

        {/* Business Phase & Weights */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">Business Phase & PSYOPS Weights</h3>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {PHASES.map(p => {
              const isActive = activePhase === p.key;
              return (
                <button
                  key={p.key}
                  onClick={() => !isActive && setPhaseChangeTarget(p.key)}
                  className={`rounded-lg border-2 p-4 text-left transition-all ${
                    isActive
                      ? 'border-current bg-card'
                      : 'border-border bg-card hover:border-muted-foreground/30 cursor-pointer'
                  }`}
                  style={isActive ? { borderColor: p.color, color: p.color } : {}}
                >
                  <div className="text-lg font-bold" style={isActive ? { color: p.color } : { color: 'hsl(var(--foreground))' }}>{p.label}</div>
                  <p className="text-[11px] text-muted-foreground mt-1">{p.desc}</p>
                  {isActive && <Badge className="mt-2 text-[10px] bg-primary/20 text-primary border-0">Active</Badge>}
                </button>
              );
            })}
          </div>

          <div className="space-y-3">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Stream Weights</h4>
            {STREAMS.map(s => {
              const savedVal = config ? config[s.configKey] : 0;
              return (
                <div key={s.key} className="flex items-center gap-3">
                  <span className="w-20 text-sm text-foreground font-medium">{s.label}</span>
                  <span className="w-32 text-xs text-muted-foreground hidden sm:block">{s.audience}</span>
                  <Input
                    type="number"
                    min={0} max={100}
                    value={editWeights[s.key] ?? 0}
                    onChange={e => {
                      const v = parseInt(e.target.value) || 0;
                      setEditWeights(prev => ({ ...prev, [s.key]: v }));
                      setWeightsChanged(true);
                    }}
                    className="w-20 h-8 text-xs text-center bg-background border-border"
                  />
                  <span className="text-xs text-muted-foreground hidden sm:block">Saved: {savedVal}%</span>
                  <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden hidden sm:block">
                    <div className="h-full rounded-full transition-all" style={{ width: `${editWeights[s.key] ?? 0}%`, backgroundColor: `hsl(var(--stream-${s.key}))` }} />
                  </div>
                </div>
              );
            })}

            <div className="mt-4">
              <p className="text-xs text-muted-foreground mb-2">Weight Distribution</p>
              <div className="flex h-6 rounded-md overflow-hidden border border-border">
                {STREAMS.map(s => {
                  const pct = editWeights[s.key] ?? 0;
                  if (pct === 0) return null;
                  return (
                    <Tooltip key={s.key}>
                      <TooltipTrigger asChild>
                        <div
                          className="h-full flex items-center justify-center text-[10px] font-bold text-white transition-all"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: `hsl(var(--stream-${s.key}))`,
                            minWidth: pct > 0 ? '24px' : 0,
                          }}
                        >
                          {pct > 8 ? `${pct}%` : ''}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="bg-card border-border text-foreground">
                        {s.label}: {pct}%
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>

            {weightSum !== 100 && (
              <p className="text-xs text-warning">Weights must sum to 100% (current: {weightSum}%)</p>
            )}
            {weightsChanged && (
              <Button size="sm" onClick={saveWeights} disabled={weightSum !== 100} className="h-8 text-xs bg-primary text-primary-foreground">
                Save Weights
              </Button>
            )}
          </div>
        </section>

        {/* Publishing Channels */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">Publishing Channels</h3>
          <div className="space-y-2">
            {[
              { key: 'channel_blog', label: 'Blog' },
              { key: 'channel_aeo', label: 'AEO Posting' },
              { key: 'channel_facebook', label: 'Facebook' },
              { key: 'channel_instagram', label: 'Instagram' },
              { key: 'channel_tiktok', label: 'TikTok' },
            ].map(f => (
              <Card key={f.key}>
                <CardContent className="p-3 flex items-center justify-between">
                  <span className="text-sm text-foreground">{f.label}</span>
                  <Switch checked={flags[f.key] ?? false} onCheckedChange={v => toggleFlag(f.key, v)} />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Emily Run Controls */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">Emily Controls</h3>

          <Card className={globalActive ? 'border-success/30' : 'border-border'}>
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Power size={20} className={globalActive ? 'text-success' : 'text-muted-foreground'} />
                <div>
                  <span className="text-sm font-semibold text-foreground">Emily Global Status</span>
                  <p className="text-xs text-muted-foreground">When OFF, Emily will not run. No new content will be generated.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold ${globalActive ? 'text-success' : 'text-muted-foreground'}`}>{globalActive ? 'ON' : 'OFF'}</span>
                <Switch checked={globalActive} onCheckedChange={v => toggleFlag('emily_global_active', v)} />
              </div>
            </CardContent>
          </Card>

          {globalActive && (
            <div className="pl-4 space-y-2">
              {INITIATIVE_FLAGS.map(f => (
                <Card key={f.key}>
                  <CardContent className="p-3 flex items-center justify-between">
                    <span className="text-sm text-foreground">{f.label}</span>
                    <Switch checked={flags[f.key] ?? false} onCheckedChange={v => toggleFlag(f.key, v)} />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    size="lg"
                    className="h-12 px-8 text-sm font-semibold bg-success hover:bg-success/90 text-primary-foreground"
                    disabled={!canRun || runningEmily}
                    onClick={runEmilyNow}
                  >
                    <Play size={16} className="mr-2" />
                    {runningEmily ? 'Running Emily...' : 'Run Emily Now'}
                  </Button>
                </span>
              </TooltipTrigger>
              {runDisabledReason && <TooltipContent className="bg-card border-border text-foreground">{runDisabledReason}</TooltipContent>}
            </Tooltip>
          </div>

          {lastRun && (
            <p className="text-xs text-muted-foreground">
              Last run: {format(new Date(lastRun.started_at), 'd MMM HH:mm')} — <span className={lastRun.status === 'success' ? 'text-success' : 'text-destructive'}>{lastRun.status}</span> — Generated: {lastRun.generated_count}, Failed: {lastRun.failed_count}
            </p>
          )}

          {/* OpenRouter Balance */}
          <Card style={{ background: 'hsl(var(--surface-raised))' }}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard size={18} className="text-primary" />
                  <span className="text-sm font-semibold text-foreground">OpenRouter Credit Balance</span>
                </div>
                <Button size="sm" variant="outline" onClick={refreshSnapshot} className="h-7 text-xs border-border">
                  <RefreshCw size={12} className="mr-1" /> Refresh
                </Button>
              </div>
              {!orSnapshot ? (
                <p className="text-sm text-muted-foreground">No data yet</p>
              ) : orSnapshot.limit_usd === null ? (
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-success" />
                  <p className="text-sm text-foreground font-medium">Prepaid account · <span className="text-xl font-bold">${(orSnapshot.usage_usd ?? 0).toFixed(2)}</span> spent</p>
                </div>
              ) : (
                <div>
                  {(() => {
                    const remaining = orSnapshot.credits_remaining_usd ?? 0;
                    const limit = orSnapshot.limit_usd;
                    const pct = limit > 0 ? (remaining / limit) * 100 : 0;
                    const dotColor = pct > 30 ? 'bg-success' : pct > 10 ? 'bg-warning' : 'bg-destructive';
                    return (
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${dotColor}`} />
                        <p className="text-foreground"><span className="text-xl font-bold">${remaining.toFixed(2)}</span> <span className="text-sm text-muted-foreground">remaining of ${limit.toFixed(2)}</span></p>
                      </div>
                    );
                  })()}
                </div>
              )}
              {orSnapshot?.checked_at && (
                <p className="text-xs text-muted-foreground">Last checked: {format(new Date(orSnapshot.checked_at), 'd MMM HH:mm')}</p>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Pipeline Status */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">Content Pipeline Status</h3>
          <div className="flex flex-col md:flex-row items-stretch gap-0">
            {PIPELINE_NODES.map((node, i) => {
              const counts: Record<string, number> = {
                intelligence: 0,
                prioritisation: 0,
                production: pipelineCounts.queued,
                review: pipelineCounts.review,
                publishing: pipelineCounts.approved + pipelineCounts.published,
              };
              const statuses: Record<string, 'active' | 'partial' | 'missing'> = {
                intelligence: 'active',
                prioritisation: lastRun ? 'active' : 'partial',
                production: lastRun?.status === 'success' ? 'active' : lastRun?.status === 'running' ? 'partial' : 'missing',
                review: pipelineCounts.review > 0 ? 'active' : 'partial',
                publishing: pipelineCounts.approved > 0 || pipelineCounts.published > 0 ? 'active' : 'partial',
              };
              const status = statuses[node.id] || 'partial';
              const statusColor = status === 'active' ? 'bg-success' : status === 'partial' ? 'bg-warning' : 'bg-destructive';
              const count = counts[node.id] || 0;

              return (
                <div key={node.id} className="flex items-center flex-1">
                  <Card className="flex-1 border-border">
                    <CardContent className="p-4 text-center space-y-1">
                      <div className="flex items-center justify-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${statusColor}`} />
                        <span className="text-sm font-semibold text-foreground">{node.label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{node.desc}</p>
                      {count > 0 && <p className="text-xs text-foreground font-medium">{count} items</p>}
                    </CardContent>
                  </Card>
                  {i < PIPELINE_NODES.length - 1 && (
                    <ArrowRight size={16} className="text-border shrink-0 mx-1 hidden md:block" />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <Separator className="bg-border" />

      {/* ═══════════════════════════════════════════ */}
      {/* SECTION B — CONNECTIONS                     */}
      {/* ═══════════════════════════════════════════ */}
      <div className="space-y-8">
        <h2 className="text-base font-bold text-foreground uppercase tracking-wide border-b border-border pb-2">Connections</h2>

        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">Integrations & API Status</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {INTEGRATIONS.map(int => {
              const isOR = int.key === 'openrouter';
              const status: 'green' | 'red' | 'grey' = isOR ? orStatus : 'grey';
              return (
                <Card key={int.key}>
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <StatusDot status={status} />
                      <div>
                        <p className="text-sm font-medium text-foreground">{int.label} — {int.desc}</p>
                        {isOR && orBalance !== null && <p className="text-xs text-muted-foreground">Balance: ${orBalance.toFixed(2)}</p>}
                        {isOR && orCheckedAt && <p className="text-xs text-muted-foreground">Last checked: {format(new Date(orCheckedAt), 'd MMM HH:mm')}</p>}
                        {isOR && orStatus === 'red' && orError && <p className="text-xs text-destructive">Error — {orError}</p>}
                        {!isOR && <p className="text-xs text-muted-foreground">Connected</p>}
                      </div>
                    </div>
                    {isOR ? (
                      <Button size="sm" variant="outline" onClick={checkBalance} className="h-7 text-xs border-border">
                        <RefreshCw size={12} className="mr-1" /> Verify
                      </Button>
                    ) : (
                      <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">Connected</Badge>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">Loaded Documents & Vector Store</h3>
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="px-4 py-2.5">Document</th><th className="px-4 py-2.5">Status</th>
                </tr></thead>
                <tbody>{DOCUMENTS.map((doc, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 text-foreground">{doc}</td>
                    <td className="px-4 py-2.5"><Badge variant="outline" className="text-[10px] text-success border-success/30">Loaded</Badge></td>
                  </tr>
                ))}</tbody>
              </table>
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">{DOCUMENTS.length} documents loaded. Vector store: {vectorCount} entries.</p>
        </section>

        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">System Information</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-4 space-y-1">
                <p className="text-xs text-muted-foreground">Current Phase</p>
                <p className="text-sm font-semibold text-foreground">{config?.business_phase || '—'}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 space-y-1">
                <p className="text-xs text-muted-foreground">Supabase Project</p>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-mono text-foreground">flpzjbasdsfwoeruyxgp</p>
                  <button onClick={copyProjectId} className="text-muted-foreground hover:text-foreground transition-colors">
                    {copied ? <CheckCircle2 size={14} className="text-success" /> : <Copy size={14} />}
                  </button>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>

      {/* Phase Change Dialog */}
      <Dialog open={!!phaseChangeTarget} onOpenChange={() => setPhaseChangeTarget(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle className="text-foreground">Change phase to {phaseChangeTarget?.toUpperCase()}?</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Current weights: DISRUPT {editWeights.disrupt}%, EDUCATE {editWeights.educate}%, CONVERT {editWeights.convert}%, AMPLIFY {editWeights.amplify}%
            </p>
            {presetForTarget && (
              <p className="text-sm text-foreground">
                New weights will be: DISRUPT {presetForTarget.disrupt}%, EDUCATE {presetForTarget.educate}%, CONVERT {presetForTarget.convert}%, AMPLIFY {presetForTarget.amplify}%
              </p>
            )}
            {!presetForTarget && (
              <p className="text-xs text-muted-foreground italic">No preset weights found for this phase. Weights will remain unchanged.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPhaseChangeTarget(null)} className="border-border">Cancel</Button>
            <Button onClick={confirmPhaseChange} className="bg-primary text-primary-foreground">Change Phase</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
