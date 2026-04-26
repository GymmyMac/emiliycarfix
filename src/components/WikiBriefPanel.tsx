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

  // Fetch the priority queue once
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
    try {
      const sample = await generateSampleForVehicle(nextToSample);
      setSamples(prev => [...prev, sample]);
      setPhase('review');
    } catch (e: any) {
      setError(e?.message || 'Sample generation failed.');
      setPhase('review');
    }
  };

  const reject = () => {
    onReject?.();
  };

  const approveAndRun = async () => {
    setPhase('deploying');
    const results: DeployResult[] = [];

    // Persist already-sampled vehicles directly without regenerating
    for (const s of samples) {
      const r = await writeWikiToDb(s.vehicle, s.wiki);
      results.push(r);
      setDeployResults([...results]);
      setDeployProgress({ current: results.length, total: vehicles.length });
    }

    // Generate + deploy the rest
    const remaining = vehicles.filter(v => !sampledIds.has(v.id));
    for (const v of remaining) {
      const r = await deployVehicle(v);
      results.push(r);
      setDeployResults([...results]);
      setDeployProgress({ current: results.length, total: vehicles.length });
    }

    setPhase('done');
    const live = results.filter(r => r.success).length;
    const skipped = results.filter(r => r.skipped).length;
    const failed = results.filter(r => !r.success && !r.skipped).length;
    onDone?.(`Deployed ${live} pages. ${skipped} skipped (already had content)${failed ? `, ${failed} failed` : ''}.`);
  };

  return (
    <div className="rounded-xl border border-[#334155] bg-[#0F172A] p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles size={14} className="text-[#F59E0B]" />
        <span className="text-[10px] uppercase tracking-wider text-[#F59E0B] font-semibold">Wiki Brief Workflow</span>
      </div>

      {phase === 'loading' && (
        <p className="text-sm text-[#94A3B8]">Pulling the priority queue…</p>
      )}

      {phase === 'error' && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 text-sm text-red-400">
            <AlertTriangle size={14} className="mt-0.5" />
            <span>{error}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={reject} className="text-xs text-[#94A3B8] hover:text-white hover:bg-[#334155]">
            Close
          </Button>
        </div>
      )}

      {(phase === 'confirm' || phase === 'sampling' || phase === 'review') && vehicles.length > 0 && (
        <>
          <div>
            <p className="text-sm text-white">
              I'll generate <span className="font-semibold text-[#F59E0B]">{vehicles.length}</span> wiki page{vehicles.length === 1 ? '' : 's'}, ordered by NZ fleet priority. Pages with existing content will be skipped.
            </p>
            <div className="mt-3 max-h-44 overflow-y-auto rounded border border-[#334155] divide-y divide-[#1E293B]">
              {vehicles.map((v, i) => (
                <div key={v.id} className="flex items-center justify-between px-3 py-1.5 text-xs">
                  <span className="text-[#E2E8F0]">
                    <span className="text-[#64748B] mr-2">#{i + 1}</span>
                    {v.make} {v.model} {v.generation} ({v.years_start}{v.years_end ? `–${v.years_end}` : '+'})
                  </span>
                  <span className="text-[#64748B]">
                    {v.estimated_nz_owners != null ? `${v.estimated_nz_owners.toLocaleString()} NZ owners` : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {samples.length > 0 && (
            <div className="space-y-3">
              <div className="text-[10px] uppercase tracking-wider text-[#94A3B8] font-semibold">
                Sample Previews ({samples.length})
              </div>
              {samples.map((s, idx) => (
                <SampleCard key={s.vehicle.id} index={idx + 1} sample={s} />
              ))}
            </div>
          )}

          {error && phase === 'review' && (
            <div className="flex items-start gap-2 text-xs text-red-400">
              <AlertTriangle size={12} className="mt-0.5" /> <span>{error}</span>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            {samples.length === 0 ? (
              <Button onClick={writeSample} disabled={phase === 'sampling'} className="bg-[#F59E0B] hover:bg-[#D97706] text-black h-8 text-xs">
                {phase === 'sampling' ? <RefreshCw size={12} className="mr-1.5 animate-spin" /> : <Sparkles size={12} className="mr-1.5" />}
                Write Sample
              </Button>
            ) : (
              <>
                <Button onClick={approveAndRun} disabled={phase === 'sampling'} className="bg-[#F59E0B] hover:bg-[#D97706] text-black h-8 text-xs">
                  <Rocket size={12} className="mr-1.5" />
                  Approve &amp; Run Full Batch ({vehicles.length})
                </Button>
                <Button onClick={writeSample} variant="ghost" disabled={phase === 'sampling' || allSampled}
                  className="h-8 text-xs text-[#94A3B8] hover:text-white hover:bg-[#334155]">
                  {phase === 'sampling' ? <RefreshCw size={12} className="mr-1.5 animate-spin" /> : <Sparkles size={12} className="mr-1.5" />}
                  {allSampled ? 'All Sampled' : 'Sample One More'}
                </Button>
                <Button onClick={reject} variant="ghost" className="h-8 text-xs text-[#94A3B8] hover:text-red-400 hover:bg-[#334155]">
                  <X size={12} className="mr-1.5" />
                  Reject — Revise Brief
                </Button>
              </>
            )}
          </div>
        </>
      )}

      {phase === 'deploying' && (
        <div className="space-y-3">
          <p className="text-sm text-white">
            Deploying <span className="font-semibold text-[#F59E0B]">{deployProgress.current}</span> of {deployProgress.total}…
          </p>
          <div className="h-2 w-full rounded-full bg-[#1E293B] overflow-hidden">
            <div
              className="h-full bg-[#F59E0B] transition-all"
              style={{ width: `${deployProgress.total ? (deployProgress.current / deployProgress.total) * 100 : 0}%` }}
            />
          </div>
          <DeployList results={deployResults} />
        </div>
      )}

      {phase === 'done' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-green-400">
            <Check size={14} />
            <span>
              {deployResults.filter(r => r.success).length} pages live.{' '}
              {deployResults.filter(r => r.skipped).length} skipped (already had content).
              {deployResults.filter(r => !r.success && !r.skipped).length > 0 && (
                <> {deployResults.filter(r => !r.success && !r.skipped).length} failed.</>
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
    <div className="rounded-lg border border-[#334155] bg-[#1E293B] p-3 space-y-2">
      <div className="flex items-center justify-between">
        <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-[#334155] text-[#94A3B8]">
          Sample #{index}
        </Badge>
        <span className="text-[10px] text-[#94A3B8]">
          {vehicle.make} {vehicle.model} {vehicle.generation}
        </span>
      </div>
      {wiki.seo_title && (
        <div>
          <div className="text-[10px] uppercase text-[#64748B]">SEO Title</div>
          <div className="text-xs text-white">{wiki.seo_title}</div>
        </div>
      )}
      {wiki.aeo_intro && (
        <div>
          <div className="text-[10px] uppercase text-[#64748B]">Intro</div>
          <div className="text-xs text-[#E2E8F0] whitespace-pre-wrap">{wiki.aeo_intro}</div>
        </div>
      )}
      {wiki.common_issues && (
        <div>
          <div className="text-[10px] uppercase text-[#64748B]">Common Issues</div>
          <div className="text-xs text-[#E2E8F0] whitespace-pre-wrap line-clamp-6">{wiki.common_issues}</div>
        </div>
      )}
      {wiki.wof_notes && (
        <div>
          <div className="text-[10px] uppercase text-[#64748B]">WOF Notes</div>
          <div className="text-xs text-[#E2E8F0] whitespace-pre-wrap line-clamp-4">{wiki.wof_notes}</div>
        </div>
      )}
    </div>
  );
}

function DeployList({ results }: { results: DeployResult[] }) {
  if (results.length === 0) return null;
  return (
    <div className="max-h-44 overflow-y-auto rounded border border-[#334155] divide-y divide-[#1E293B]">
      {results.map((r, i) => (
        <div key={i} className="flex items-center justify-between px-3 py-1.5 text-xs">
          <span className="text-[#E2E8F0]">{r.make} {r.model}</span>
          <span className={
            r.success ? 'text-green-400'
            : r.skipped ? 'text-[#94A3B8]'
            : 'text-red-400'
          }>
            {r.success ? '✓ live' : r.skipped ? '— skipped' : `✗ ${r.error || 'failed'}`}
          </span>
        </div>
      ))}
    </div>
  );
}
