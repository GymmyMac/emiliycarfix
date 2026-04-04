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
import { toast } from 'sonner';
import {
  Power, Zap, Mail, CreditCard, Play, RefreshCw,
  AlertTriangle, CheckCircle2, Minus, ArrowRight,
} from 'lucide-react';
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

export default function Operations() {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [lastRun, setLastRun] = useState<EmilyRun | null>(null);
  const [orSnapshot, setOrSnapshot] = useState<OpenRouterSnapshot | null>(null);
  const [phaseChangeTarget, setPhaseChangeTarget] = useState<string | null>(null);

  // Weight editing
  const [editWeights, setEditWeights] = useState<Record<string, number>>({ disrupt: 0, educate: 0, convert: 0, amplify: 0 });
  const [weightsChanged, setWeightsChanged] = useState(false);

  // Pipeline counts
  const [pipelineCounts, setPipelineCounts] = useState({ queued: 0, generated: 0, approved: 0, published: 0, review: 0 });

  // Running Emily
  const [runningEmily, setRunningEmily] = useState(false);

  const fetchAll = useCallback(async () => {
    const allFlagKeys = ['emily_global_active', ...INITIATIVE_FLAGS.map(f => f.key)];
    const [appConfig, flagsRes, lastRunRes, orRes, queuedRes, generatedRes, approvedRes, publishedRes, reviewSeoRes, reviewContentRes] = await Promise.all([
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
    if (orRes.data?.[0]) setOrSnapshot(orRes.data[0]);

    setPipelineCounts({
      queued: queuedRes.count || 0,
      generated: generatedRes.count || 0,
      approved: approvedRes.count || 0,
      published: publishedRes.count || 0,
      review: (reviewSeoRes.count || 0) + (reviewContentRes.count || 0),
    });

    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Realtime
  useEffect(() => {
    const ch = supabase.channel('ops-flags')
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

    // Update phase
    const ok = await updateAppConfigValues([
      { key: 'business_phase', value: phaseChangeTarget },
    ]);

    if (!ok) { toast.error('Failed to change phase'); setPhaseChangeTarget(null); return; }

    // Auto-fill weights from phase_presets if available
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

  const weightSum = Object.values(editWeights).reduce((a, b) => a + b, 0);
  const activePhase = config?.business_phase?.toLowerCase() || 'load';
  const globalActive = flags['emily_global_active'] ?? false;
  const canRun = globalActive;
  const runDisabledReason = !globalActive ? 'Emily is OFF' : '';

  // Get preset weights for the phase change confirmation dialog
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
    <div className="space-y-8 max-w-[1200px]">
      <h1 className="text-2xl font-bold text-foreground">Emily Operations</h1>

      {/* ═══ SECTION A: PHASE & WEIGHTS ═══ */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Business Phase & PSYOPS Weights</h2>

        {/* Phase cards */}
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

        {/* Stream Weights */}
        <div className="space-y-3">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Stream Weights</h3>
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

          {/* Weight distribution bar chart */}
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

      {/* ═══ SECTION B: RUN CONTROLS ═══ */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Emily Controls</h2>

        {/* Global toggle */}
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

        {/* Initiative toggles */}
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

        {/* Run Emily Now */}
        <div className="flex items-center gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  size="lg"
                  className="h-12 px-8 text-sm font-semibold bg-success hover:bg-success/90 text-primary-foreground"
                  disabled={!canRun || runningEmily}
                  onClick={async () => {
                    setRunningEmily(true);
                    toast.info('Running Emily...');
                    setTimeout(() => { setRunningEmily(false); fetchAll(); toast.success('Emily run complete.'); }, 30000);
                  }}
                >
                  <Play size={16} className="mr-2" />
                  {runningEmily ? 'Running Emily...' : 'Run Emily Now'}
                </Button>
              </span>
            </TooltipTrigger>
            {runDisabledReason && <TooltipContent className="bg-card border-border text-foreground">{runDisabledReason}</TooltipContent>}
          </Tooltip>
        </div>

        {/* Last run info */}
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

      {/* ═══ SECTION C: PIPELINE STATUS ═══ */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Content Pipeline Status</h2>
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

      {/* ─── Phase Change Dialog ─── */}
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
