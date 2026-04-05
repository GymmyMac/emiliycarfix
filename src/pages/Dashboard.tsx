import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { fetchAppConfig, type AppConfig } from '@/lib/appConfig';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CheckCircle2, AlertTriangle, ArrowRight, ChevronDown, ChevronUp,
} from 'lucide-react';
import { format, subDays } from 'date-fns';

/* ─── Types ─── */
interface EmilyRun {
  id: string;
  started_at: string;
  status: string;
  generated_count: number;
  failed_count: number;
}

interface CronJob {
  jobname: string;
  schedule: string;
  last_run: string;
  status: string;
  return_message: string | null;
}

const PHASE_CONFIG: Record<string, { color: string; desc: string }> = {
  FORM: { color: 'hsl(var(--phase-form))', desc: 'Foundational architecture' },
  LOAD: { color: 'hsl(var(--phase-load))', desc: 'Content generation & testing' },
  LAUNCH: { color: 'hsl(var(--phase-launch))', desc: 'Market entry & activation' },
  STORM: { color: 'hsl(var(--phase-storm))', desc: 'Aggressive growth' },
  PERFORM: { color: 'hsl(var(--phase-perform))', desc: 'Scale & retention' },
};

const STREAM_CONFIG = [
  { key: 'disrupt', label: 'DISRUPT', color: 'hsl(var(--stream-disrupt))' },
  { key: 'educate', label: 'EDUCATE', color: 'hsl(var(--stream-educate))' },
  { key: 'convert', label: 'CONVERT', color: 'hsl(var(--stream-convert))' },
  { key: 'amplify', label: 'AMPLIFY', color: 'hsl(var(--stream-amplify))' },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<AppConfig | null>(null);

  // Block 1 — Cron jobs
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [cronExpanded, setCronExpanded] = useState(false);

  // Block 2 — Emily
  const [emilyRuns, setEmilyRuns] = useState<EmilyRun[]>([]);
  const [articlesGenerated, setArticlesGenerated] = useState(0);
  const [articlesPublished, setArticlesPublished] = useState(0);

  // Block 3 — Approvals
  const [pendingApprovals, setPendingApprovals] = useState(0);

  // Block 4 — Pipeline
  const [queueDepth, setQueueDepth] = useState(0);

  // Issues for header
  const [issues, setIssues] = useState<string[]>([]);

  const fetchAll = useCallback(async () => {
    const yesterday = subDays(new Date(), 1);
    const yesterdayISO = yesterday.toISOString();

    const [
      appConfig,
      cronRes,
      emilyRunsRes,
      publishedRes,
      pendingRes,
      queueRes,
    ] = await Promise.all([
      fetchAppConfig(),
      supabase.rpc('get_cron_job_health'),
      supabase.from('emily_runs').select('id, started_at, status, generated_count, failed_count').gte('started_at', yesterdayISO).order('started_at', { ascending: false }),
      supabase.from('mkt_seo_queue').select('id', { count: 'exact', head: true }).eq('status', 'published').gte('updated_at', yesterdayISO),
      supabase.from('mkt_seo_queue').select('id', { count: 'exact', head: true }).eq('james_approved', false).not('draft_content', 'is', null),
      supabase.from('mkt_seo_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);

    if (appConfig) setConfig(appConfig);

    const jobs: CronJob[] = cronRes.data || [];
    setCronJobs(jobs);

    // Emily
    const runs = emilyRunsRes.data || [];
    setEmilyRuns(runs);
    setArticlesGenerated(runs.reduce((s, r) => s + (r.generated_count || 0), 0));
    setArticlesPublished(publishedRes.count || 0);

    // Approvals
    setPendingApprovals(pendingRes.count || 0);

    // Queue
    setQueueDepth(queueRes.count || 0);

    // Compute issues
    const issueList: string[] = [];
    const failedJobs = jobs.filter(j => j.status === 'failed');
    if (failedJobs.length > 0) issueList.push(`${failedJobs.length} cron job${failedJobs.length > 1 ? 's' : ''} failed`);
    const failedRuns = runs.filter(r => r.status === 'failed');
    if (failedRuns.length > 0) issueList.push(`${failedRuns.length} Emily run${failedRuns.length > 1 ? 's' : ''} failed`);
    if ((pendingRes.count || 0) > 5) issueList.push(`${pendingRes.count} items awaiting approval`);
    setIssues(issueList);

    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    const ch = supabase.channel('dash-brief')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'emily_runs' }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchAll]);

  if (loading) {
    return (
      <div className="space-y-6 max-w-[1000px]">
        <Skeleton className="h-14 w-full rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-32" /><Skeleton className="h-32" />
          <Skeleton className="h-32" /><Skeleton className="h-32" />
        </div>
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

  const lastNightDate = format(subDays(new Date(), 1), 'EEEE d MMMM');
  const healthy = issues.length === 0;
  const cronTotal = cronJobs.length;
  const cronPassed = cronJobs.filter(j => j.status === 'succeeded').length;
  const avgPerRun = emilyRuns.length > 0 ? Math.round(articlesGenerated / emilyRuns.length) : 0;
  const estimatedClearanceDays = avgPerRun > 0 ? Math.ceil(queueDepth / avgPerRun) : null;

  return (
    <div className="space-y-6 max-w-[1000px]">
      {/* ═══ HEADER STRIP ═══ */}
      <div className={`rounded-lg px-6 py-4 flex items-center gap-3 ${
        healthy ? 'bg-success/10 border border-success/20' : 'bg-warning/10 border border-warning/20'
      }`}>
        {healthy ? (
          <CheckCircle2 size={20} className="text-success shrink-0" />
        ) : (
          <AlertTriangle size={20} className="text-warning shrink-0" />
        )}
        <div>
          <p className={`text-sm font-semibold ${healthy ? 'text-success' : 'text-warning'}`}>
            Last night: {lastNightDate} — {healthy ? 'All systems healthy ✅' : `${issues.length} issue${issues.length > 1 ? 's' : ''} need attention ⚠️`}
          </p>
          {!healthy && (
            <p className="text-xs text-muted-foreground mt-0.5">{issues.join(' · ')}</p>
          )}
        </div>
      </div>

      {/* ═══ BLOCK 1: OVERNIGHT AUTOMATION ═══ */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Overnight Automation</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {cronTotal > 0 ? `${cronPassed} of ${cronTotal} jobs ran successfully last night` : 'No cron data available'}
              </p>
            </div>
            {cronTotal > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setCronExpanded(!cronExpanded)} className="h-7 text-xs text-muted-foreground">
                {cronExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                <span className="ml-1">{cronExpanded ? 'Collapse' : 'Details'}</span>
              </Button>
            )}
          </div>

          {/* Job grid */}
          {cronTotal > 0 && (
            <div className="flex flex-wrap gap-2">
              {cronJobs.map((job, i) => (
                <div
                  key={i}
                  title={job.status === 'failed' && job.return_message ? `${job.jobname}: ${job.return_message}` : `${job.jobname}: ${job.status}`}
                  className="flex items-center gap-1.5 text-xs"
                >
                  {job.status === 'succeeded' ? (
                    <CheckCircle2 size={14} className="text-success shrink-0" />
                  ) : (
                    <AlertTriangle size={14} className="text-destructive shrink-0" />
                  )}
                  <span className="text-muted-foreground">{job.jobname}</span>
                </div>
              ))}
            </div>
          )}

          {/* Expanded detail table */}
          {cronExpanded && cronTotal > 0 && (
            <div className="border border-border rounded-md overflow-hidden mt-2">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-3 py-2 text-muted-foreground font-medium">Job</th>
                    <th className="text-left px-3 py-2 text-muted-foreground font-medium">Status</th>
                     <th className="text-left px-3 py-2 text-muted-foreground font-medium">Last Run</th>
                     <th className="text-left px-3 py-2 text-muted-foreground font-medium">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {cronJobs.map((job, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 text-foreground">{job.jobname}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 ${
                          job.status === 'succeeded' ? 'text-success' : job.status === 'failed' ? 'text-destructive' : 'text-warning'
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${
                            job.status === 'succeeded' ? 'bg-success' : job.status === 'failed' ? 'bg-destructive' : 'bg-warning'
                          }`} />
                          {job.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{job.last_run ? format(new Date(job.last_run), 'HH:mm') : '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground max-w-[200px] truncate">{job.return_message || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ BLOCKS 2 & 3 ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Block 2 — Emily Activity */}
        <Card>
          <CardContent className="p-5 space-y-3">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Emily Last Night</h2>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-2xl font-bold text-foreground">{emilyRuns.length}</p>
                <p className="text-xs text-muted-foreground">Runs completed</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{articlesGenerated}</p>
                <p className="text-xs text-muted-foreground">Articles generated</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{articlesPublished}</p>
                <p className="text-xs text-muted-foreground">Articles published</p>
              </div>
            </div>
            {emilyRuns.some(r => r.status === 'failed') && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle size={12} /> {emilyRuns.filter(r => r.status === 'failed').length} run(s) failed
              </p>
            )}
          </CardContent>
        </Card>

        {/* Block 3 — Approvals Waiting */}
        <Card className={pendingApprovals > 0 ? 'border-warning/40 bg-warning/5' : ''}>
          <CardContent className="p-5 space-y-3">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Your Action Needed</h2>
            <p className="text-2xl font-bold text-foreground">{pendingApprovals}</p>
            <p className="text-xs text-muted-foreground">
              {pendingApprovals === 0 ? 'No items awaiting approval' : `item${pendingApprovals > 1 ? 's' : ''} awaiting your approval`}
            </p>
            {pendingApprovals > 0 && (
              <Button size="sm" onClick={() => navigate('/approvals')} className="h-8 text-xs bg-warning text-warning-foreground hover:bg-warning/90">
                Review Now <ArrowRight size={12} className="ml-1" />
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ═══ BLOCKS 4 & 5 ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Block 4 — Pipeline Health */}
        <Card>
          <CardContent className="p-5 space-y-3">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Content Queue</h2>
            <p className="text-2xl font-bold text-foreground">{queueDepth}</p>
            <p className="text-xs text-muted-foreground">pending items in queue</p>
            {estimatedClearanceDays !== null && (
              <p className="text-xs text-muted-foreground">
                Est. clearance: <span className="text-foreground font-medium">{estimatedClearanceDays} day{estimatedClearanceDays !== 1 ? 's' : ''}</span>
                <span className="text-muted-foreground/60"> (at ~{avgPerRun} articles/run)</span>
              </p>
            )}
          </CardContent>
        </Card>

        {/* Block 5 — Current Strategy */}
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Current Strategy</h2>
              <Button variant="ghost" size="sm" onClick={() => navigate('/operations')} className="h-7 text-xs text-muted-foreground">
                Edit <ArrowRight size={12} className="ml-1" />
              </Button>
            </div>
            <Badge className="text-sm font-bold border-0" style={{ backgroundColor: `${phaseConf.color}20`, color: phaseConf.color }}>
              {phase}
            </Badge>
            <p className="text-xs text-muted-foreground">{phaseConf.desc}</p>
            <div className="space-y-1.5 pt-1">
              {STREAM_CONFIG.map(s => {
                const w = weights[s.key as keyof typeof weights];
                return (
                  <div key={s.key} className="flex items-center gap-2 text-xs">
                    <span className="w-16 text-muted-foreground">{s.label}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${w}%`, backgroundColor: s.color }} />
                    </div>
                    <span className="w-8 text-right text-foreground font-medium">{w}%</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
