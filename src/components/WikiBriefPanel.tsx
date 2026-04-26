import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Check, RefreshCw, X, Rocket, AlertTriangle, ChevronDown, ChevronRight, Maximize2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import DOMPurify from 'dompurify';
import {
  fetchPriorityVehicles,
  generateSampleForVehicle,
  writeWikiToDb,
  deployVehicle,
  type PriorityVehicle,
  type SamplePreview,
  type DeployResult,
} from '@/lib/wikiBriefWorkflow';
import { workBoard } from '@/lib/workBoardStore';

interface Props {
  batchLimit: number;
  onDone?: (summary: string) => void;
  onReject?: () => void;
}

type Phase = 'loading' | 'confirm' | 'sampling' | 'review' | 'deploying' | 'done' | 'error';

export function WikiBriefPanel({ batchLimit, onDone, onReject }: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [vehicles, setVehicles] = useState<PriorityVehicle[]>([]);
  const [samples, setSamples] = useState<SamplePreview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deployProgress, setDeployProgress] = useState({ current: 0, total: 0 });
  const [deployResults, setDeployResults] = useState<DeployResult[]>([]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const data = await fetchPriorityVehicles(batchLimit);
        if (cancel) return;
        if (data.length === 0) {
          setError('No pending vehicles found in the priority queue. Every wiki page already has content.');
          setPhase('error');
          return;
        }
        setVehicles(data);
        setPhase('confirm');
      } catch (e: any) {
        if (cancel) return;
        setError(e?.message || 'Failed to fetch priority queue.');
        setPhase('error');
      }
    })();
    return () => { cancel = true; };
  }, [batchLimit]);

  const sampledIds = useMemo(() => new Set(samples.map(s => s.vehicle.id)), [samples]);
  const nextToSample = useMemo(() => vehicles.find(v => !sampledIds.has(v.id)) || null, [vehicles, sampledIds]);
  const allSampled = !nextToSample;

  const writeSample = async () => {
    if (!nextToSample) return;
    setPhase('sampling');
    setError(null);
    workBoard.pushActivity('✏', `Sample generating — ${nextToSample.make} ${nextToSample.model} ${nextToSample.generation}`);
    try {
      const sample = await generateSampleForVehicle(nextToSample);
      setSamples(prev => [...prev, sample]);
      setPhase('review');
      workBoard.pushActivity('👁', `Sample ready — ${sample.vehicle.make} ${sample.vehicle.model}`);
    } catch (e: any) {
      setError(e?.message || 'Sample generation failed.');
      setPhase('review');
      workBoard.pushActivity('✗', `Sample failed — ${e?.message}`);
    }
  };

  const reject = () => onReject?.();

  const logResult = (r: DeployResult) => {
    if (r.status === 'live') workBoard.pushActivity('✓', `Wiki page live — ${r.make} ${r.model}`);
    else if (r.status === 'skipped') workBoard.pushActivity('⟳', `Skipped (already has content) — ${r.make} ${r.model}`);
    else workBoard.pushActivity('✗', `Failed — ${r.make} ${r.model}: ${r.reason}`);
  };

  const approveAndRun = async () => {
    // Guard: only execute when explicitly approved (samples exist & user clicked this).
    if (samples.length === 0) return;
    setPhase('deploying');
    workBoard.pushActivity('▶', `Wiki batch started — ${vehicles.length} vehicles`);
    const results: DeployResult[] = [];

    // Deploy already-sampled vehicles using the cached wiki content.
    for (const s of samples) {
      const r = await writeWikiToDb(s.vehicle, s.wiki, s.raw);
      results.push(r);
      setDeployResults([...results]);
      setDeployProgress({ current: results.length, total: vehicles.length });
      logResult(r);
    }

    // Generate + deploy the remaining vehicles.
    const remaining = vehicles.filter(v => !sampledIds.has(v.id));
    for (const v of remaining) {
      workBoard.pushActivity('⟳', `Generating — ${v.make} ${v.model} ${v.generation}`);
      const r = await deployVehicle(v);
      results.push(r);
      setDeployResults([...results]);
      setDeployProgress({ current: results.length, total: vehicles.length });
      logResult(r);
    }

    setPhase('done');
    const live = results.filter(r => r.status === 'live').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    const failed = results.filter(r => r.status === 'failed').length;
    onDone?.(`${live} live · ${skipped} skipped · ${failed} failed`);
  };

  const retryFailed = async () => {
    const failedResults = deployResults.filter(r => r.status === 'failed');
    if (failedResults.length === 0) return;
    setPhase('deploying');
    workBoard.pushActivity('▶', `Retrying ${failedResults.length} failed vehicle${failedResults.length === 1 ? '' : 's'}`);

    const updated = [...deployResults];
    let done = 0;
    for (const failed of failedResults) {
      const v = vehicles.find(x => x.id === failed.vehicleId);
      if (!v) { done++; continue; }
      workBoard.pushActivity('⟳', `Retrying — ${v.make} ${v.model} ${v.generation}`);
      const r = await deployVehicle(v);
      const idx = updated.findIndex(x => x.vehicleId === v.id);
      if (idx >= 0) updated[idx] = r; else updated.push(r);
      setDeployResults([...updated]);
      done++;
      setDeployProgress({ current: deployResults.length - failedResults.length + done, total: deployResults.length });
      logResult(r);
    }

    setPhase('done');
    const live = updated.filter(r => r.status === 'live').length;
    const skipped = updated.filter(r => r.status === 'skipped').length;
    const stillFailed = updated.filter(r => r.status === 'failed').length;
    onDone?.(`${live} live · ${skipped} skipped · ${stillFailed} failed`);
  };

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-3 shadow-card">
      <div className="flex items-center gap-2">
        <Sparkles size={12} className="text-primary" />
        <span className="text-[10px] uppercase tracking-wider text-primary font-semibold">Wiki Brief Workflow</span>
      </div>

      {phase === 'loading' && <p className="text-xs text-muted-foreground">Pulling the priority queue…</p>}

      {phase === 'error' && (
        <div className="space-y-2">
          <div className="flex items-start gap-2 text-xs text-destructive">
            <AlertTriangle size={12} className="mt-0.5" />
            <span>{error}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={reject} className="text-xs h-7">Close</Button>
        </div>
      )}

      {(phase === 'confirm' || phase === 'sampling' || phase === 'review') && vehicles.length > 0 && (
        <>
          <div>
            <p className="text-xs text-foreground">
              <span className="font-semibold text-primary">{vehicles.length}</span> wiki page{vehicles.length === 1 ? '' : 's'}, NZ fleet priority. Existing content skipped.
            </p>
            <div className="mt-2 max-h-32 overflow-y-auto rounded border border-border divide-y divide-border">
              {vehicles.map((v, i) => (
                <div key={v.id} className="flex items-center justify-between px-2 py-1 text-[11px]">
                  <span className="text-foreground">
                    <span className="text-muted-foreground mr-1.5">#{i + 1}</span>
                    {v.make} {v.model} {v.generation} ({v.years_start}{v.years_end ? `–${v.years_end}` : '+'})
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {v.estimated_nz_owners != null ? `${v.estimated_nz_owners.toLocaleString()}` : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {samples.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Samples ({samples.length})
              </div>
              {samples.map((s, idx) => (
                <SampleCard key={s.vehicle.id} index={idx + 1} sample={s} />
              ))}
            </div>
          )}

          {error && phase === 'review' && (
            <div className="flex items-start gap-2 text-[11px] text-destructive">
              <AlertTriangle size={12} className="mt-0.5" /> <span>{error}</span>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {samples.length === 0 ? (
              <Button onClick={writeSample} disabled={phase === 'sampling'} size="sm" className="h-7 text-xs">
                {phase === 'sampling' ? <RefreshCw size={11} className="mr-1 animate-spin" /> : <Sparkles size={11} className="mr-1" />}
                Write Sample
              </Button>
            ) : (
              <>
                <Button onClick={approveAndRun} disabled={phase === 'sampling'} size="sm" className="h-7 text-xs">
                  <Rocket size={11} className="mr-1" />
                  Approve &amp; Run Full Batch ({vehicles.length})
                </Button>
                <Button onClick={writeSample} variant="outline" size="sm" disabled={phase === 'sampling' || allSampled}
                  className="h-7 text-xs">
                  {phase === 'sampling' ? <RefreshCw size={11} className="mr-1 animate-spin" /> : <Sparkles size={11} className="mr-1" />}
                  {allSampled ? 'All Sampled' : 'Sample One More'}
                </Button>
                <Button onClick={reject} variant="ghost" size="sm" className="h-7 text-xs">
                  <X size={11} className="mr-1" /> Reject
                </Button>
              </>
            )}
          </div>
        </>
      )}

      {phase === 'deploying' && (
        <div className="space-y-2">
          <p className="text-xs text-foreground">
            Deploying <span className="font-semibold text-primary">{deployProgress.current}</span> of {deployProgress.total}…
          </p>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${deployProgress.total ? (deployProgress.current / deployProgress.total) * 100 : 0}%` }}
            />
          </div>
          <SummaryRow results={deployResults} />
          <FailedList results={deployResults} />
        </div>
      )}

      {phase === 'done' && (
        <div className="space-y-2">
          <SummaryRow results={deployResults} />
          <FailedList results={deployResults} />
          {deployResults.some(r => r.status === 'failed') && (
            <Button onClick={retryFailed} size="sm" variant="outline" className="h-7 text-xs">
              <RefreshCw size={11} className="mr-1" />
              Retry Failed ({deployResults.filter(r => r.status === 'failed').length})
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryRow({ results }: { results: DeployResult[] }) {
  const live = results.filter(r => r.status === 'live').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const failed = results.filter(r => r.status === 'failed').length;
  return (
    <div className="flex items-center gap-3 text-xs flex-wrap">
      <span className="flex items-center gap-1 text-success"><Check size={12} /> {live} live</span>
      <span className="text-muted-foreground">— skipped {skipped} (already had content)</span>
      <span className={failed > 0 ? 'text-destructive' : 'text-muted-foreground'}>
        ✗ {failed} failed
      </span>
    </div>
  );
}

function FailedList({ results }: { results: DeployResult[] }) {
  const failed = results.filter(r => r.status === 'failed');
  const [open, setOpen] = useState(true);
  if (failed.length === 0) return null;
  return (
    <div className="rounded border border-destructive/30 bg-destructive/5">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-2 py-1.5 text-[11px] font-semibold text-destructive"
      >
        <span className="flex items-center gap-1">
          {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          Failed vehicles ({failed.length})
        </span>
      </button>
      {open && (
        <div className="divide-y divide-destructive/20">
          {failed.map((r) => <FailedRow key={r.vehicleId} result={r} />)}
        </div>
      )}
    </div>
  );
}

function FailedRow({ result }: { result: DeployResult }) {
  const [showRaw, setShowRaw] = useState(false);
  const hasRaw = !!result.raw && result.raw.length > 0;
  return (
    <div className="px-2 py-1.5 text-[11px] space-y-1">
      <div className="flex items-start justify-between gap-2">
        <span className="text-foreground">
          ✗ {result.make} {result.model} {result.generation}
          <span className="text-destructive ml-1.5">— {result.reason}</span>
        </span>
        {hasRaw && (
          <button
            type="button"
            onClick={() => setShowRaw(s => !s)}
            className="shrink-0 text-[10px] text-muted-foreground hover:text-foreground"
          >
            {showRaw ? 'Hide response' : 'Show response ›'}
          </button>
        )}
      </div>
      {showRaw && hasRaw && (
        <pre className="text-[10px] bg-muted/50 rounded p-2 overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto">
          {result.raw}
        </pre>
      )}
    </div>
  );
}

function SampleCard({ index, sample }: { index: number; sample: SamplePreview }) {
  const { vehicle, wiki } = sample;
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="rounded-md border border-border bg-muted/40 p-2.5 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Badge variant="outline" className="text-[9px] px-1.5 py-0">Sample #{index}</Badge>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] text-muted-foreground truncate">{vehicle.make} {vehicle.model} {vehicle.generation}</span>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="shrink-0 inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline"
            >
              <Maximize2 size={10} /> Expand
            </button>
          </div>
        </div>
        {wiki.seo_title && (
          <div>
            <div className="text-[9px] uppercase text-muted-foreground">SEO Title</div>
            <div className="text-[11px] text-foreground">{wiki.seo_title}</div>
          </div>
        )}
        {wiki.aeo_intro && (
          <div>
            <div className="text-[9px] uppercase text-muted-foreground">Intro</div>
            <div className="text-[11px] text-foreground whitespace-pre-wrap line-clamp-3">{wiki.aeo_intro}</div>
          </div>
        )}
        {wiki.common_issues && (
          <div>
            <div className="text-[9px] uppercase text-muted-foreground">Common Issues</div>
            <div className="text-[11px] text-foreground whitespace-pre-wrap line-clamp-3">{wiki.common_issues}</div>
          </div>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-[10px] text-primary hover:underline"
        >
          Read full sample ›
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              Sample #{index} — {vehicle.make} {vehicle.model} {vehicle.generation}
              <span className="text-xs font-normal text-muted-foreground ml-2">
                ({vehicle.years_start}{vehicle.years_end ? `–${vehicle.years_end}` : '+'})
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Field label="SEO Title" value={wiki.seo_title} />
            <Field label="SEO Description" value={wiki.seo_description} />
            <Field label="Intro" value={wiki.aeo_intro} />
            <Field label="Body" value={wiki.aeo_body} />
            <Field label="Context" value={wiki.aeo_context ?? undefined} />
            <Field label="Common Issues" value={wiki.common_issues} />
            <Field label="WOF Notes" value={wiki.wof_notes} />
            {wiki.service_interval_km != null && (
              <Field label="Service Interval (km)" value={String(wiki.service_interval_km)} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  const looksLikeHtml = /<\/?[a-z][\s\S]*?>/i.test(value);
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">{label}</div>
      {looksLikeHtml ? (
        <div
          className="prose prose-sm max-w-none text-foreground prose-headings:text-foreground prose-headings:font-semibold prose-h3:text-sm prose-h3:mt-3 prose-h3:mb-1 prose-p:my-1.5 prose-p:leading-relaxed prose-strong:text-foreground prose-ul:my-1.5 prose-li:my-0.5"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(value) }}
        />
      ) : (
        <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{value}</div>
      )}
    </div>
  );
}
