import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Check, RefreshCw, X, Rocket, AlertTriangle } from 'lucide-react';
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

  const approveAndRun = async () => {
    setPhase('deploying');
    workBoard.pushActivity('▶', `Wiki batch started — ${vehicles.length} vehicles`);
    const results: DeployResult[] = [];

    for (const s of samples) {
      const r = await writeWikiToDb(s.vehicle, s.wiki);
      results.push(r);
      setDeployResults([...results]);
      setDeployProgress({ current: results.length, total: vehicles.length });
      if (r.success) workBoard.pushActivity('✓', `Wiki page live — ${r.make} ${r.model}`);
      else if (r.skipped) workBoard.pushActivity('⟳', `Skipped (already has content) — ${r.make} ${r.model}`);
      else workBoard.pushActivity('✗', `Failed — ${r.make} ${r.model}: ${r.error}`);
    }

    const remaining = vehicles.filter(v => !sampledIds.has(v.id));
    for (const v of remaining) {
      workBoard.pushActivity('⟳', `Generating — ${v.make} ${v.model} ${v.generation}`);
      const r = await deployVehicle(v);
      results.push(r);
      setDeployResults([...results]);
      setDeployProgress({ current: results.length, total: vehicles.length });
      if (r.success) workBoard.pushActivity('✓', `Wiki page live — ${r.make} ${r.model}`);
      else if (r.skipped) workBoard.pushActivity('⟳', `Skipped (already has content) — ${r.make} ${r.model}`);
      else workBoard.pushActivity('✗', `Failed — ${r.make} ${r.model}: ${r.error}`);
    }

    setPhase('done');
    const live = results.filter(r => r.success).length;
    const skipped = results.filter(r => r.skipped).length;
    const failed = results.filter(r => !r.success && !r.skipped).length;
    onDone?.(`${live} live, ${skipped} skipped${failed ? `, ${failed} failed` : ''}`);
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
                  Approve &amp; Run ({vehicles.length})
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
          <DeployList results={deployResults} />
        </div>
      )}

      {phase === 'done' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-success">
            <Check size={12} />
            <span>
              {deployResults.filter(r => r.success).length} live · {deployResults.filter(r => r.skipped).length} skipped
              {deployResults.filter(r => !r.success && !r.skipped).length > 0 && (
                <> · {deployResults.filter(r => !r.success && !r.skipped).length} failed</>
              )}
            </span>
          </div>
          <DeployList results={deployResults} />
        </div>
      )}
    </div>
  );
}

function SampleCard({ index, sample }: { index: number; sample: SamplePreview }) {
  const { vehicle, wiki } = sample;
  return (
    <div className="rounded-md border border-border bg-muted/40 p-2.5 space-y-1.5">
      <div className="flex items-center justify-between">
        <Badge variant="outline" className="text-[9px] px-1.5 py-0">Sample #{index}</Badge>
        <span className="text-[10px] text-muted-foreground">{vehicle.make} {vehicle.model} {vehicle.generation}</span>
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
          <div className="text-[11px] text-foreground whitespace-pre-wrap">{wiki.aeo_intro}</div>
        </div>
      )}
      {wiki.common_issues && (
        <div>
          <div className="text-[9px] uppercase text-muted-foreground">Common Issues</div>
          <div className="text-[11px] text-foreground whitespace-pre-wrap line-clamp-4">{wiki.common_issues}</div>
        </div>
      )}
      {wiki.wof_notes && (
        <div>
          <div className="text-[9px] uppercase text-muted-foreground">WOF Notes</div>
          <div className="text-[11px] text-foreground whitespace-pre-wrap line-clamp-3">{wiki.wof_notes}</div>
        </div>
      )}
    </div>
  );
}

function DeployList({ results }: { results: DeployResult[] }) {
  if (results.length === 0) return null;
  return (
    <div className="max-h-32 overflow-y-auto rounded border border-border divide-y divide-border">
      {results.map((r, i) => (
        <div key={i} className="flex items-center justify-between px-2 py-1 text-[11px]">
          <span className="text-foreground">{r.make} {r.model}</span>
          <span className={r.success ? 'text-success' : r.skipped ? 'text-muted-foreground' : 'text-destructive'}>
            {r.success ? '✓ live' : r.skipped ? '— skipped' : `✗ ${r.error || 'failed'}`}
          </span>
        </div>
      ))}
    </div>
  );
}
