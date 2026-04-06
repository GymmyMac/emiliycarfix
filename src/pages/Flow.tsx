import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import PageHeader from '@/components/PageHeader';
import { cn } from '@/lib/utils';

// Channel accent colours
const ACCENTS = {
  seo: '#3b82f6',
  partslot: '#a855f7',
  aeo: '#f59e0b',
  youtube: '#ef4444',
};

const STREAM_COLOURS: Record<string, string> = {
  disrupt: 'bg-red-600 text-white',
  educate: 'bg-blue-600 text-white',
  convert: 'bg-green-600 text-white',
  amplify: 'bg-purple-600 text-white',
};

// ── Helpers ──

function StatCell({ value, label, className }: { value: string | number; label: string; className?: string }) {
  return (
    <div className={cn('text-center', className)}>
      <div className="text-4xl font-bold text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

function PulsingDot() {
  return <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse mr-1.5" />;
}

function ContentCard({
  title,
  category,
  stream,
  preview,
  accent,
  publishLabel = 'PUBLISH',
  onPublish,
  onReject,
  extra,
}: {
  title: string;
  category?: string;
  stream?: string;
  preview?: string;
  accent: string;
  publishLabel?: string;
  onPublish: () => void;
  onReject?: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="border border-border rounded-md p-3 mb-2" style={{ borderLeftWidth: 3, borderLeftColor: accent }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm text-foreground truncate">{title}</p>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {category && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{category}</Badge>}
            {stream && (
              <Badge className={cn('text-[10px] px-1.5 py-0 uppercase', STREAM_COLOURS[stream.toLowerCase()] || 'bg-muted text-foreground')}>
                {stream}
              </Badge>
            )}
            {extra}
          </div>
          {preview && <p className="text-xs text-muted-foreground italic mt-1.5 line-clamp-2">{preview}</p>}
        </div>
        <Button
          size="sm"
          className="shrink-0 h-8 text-xs font-bold"
          style={{ backgroundColor: accent }}
          onClick={onPublish}
        >
          {publishLabel}
        </Button>
      </div>
      {onReject && (
        <button onClick={onReject} className="text-[10px] text-muted-foreground hover:text-destructive mt-1 float-right">✕ Reject</button>
      )}
    </div>
  );
}

// ── Data fetching types ──

interface FlowData {
  queue: { seo: number; partslot: number; aeo: number; ytSearches: number; ytMakes: number };
  generating: {
    seoCount: number;
    partslotCount: number;
    partslotJobs: { make: string; model: string; desc: string }[];
    aeoRunning: boolean;
    aeoToday: number;
    ytToday: number;
  };
  ready: {
    seo: any[];
    partslot: any[];
    aeo: any[];
    youtube: any[];
  };
  published: {
    seoTotal: number;
    seoToday: number;
    seoWeek: number;
    seoRecent: string[];
    partslotTotal: number;
    aeoTotal: number;
    ytVideos: number;
    ytVehicles: number;
    ytJobTypes: number;
  };
  velocity: {
    seoPerDay: number;
    seoQueueSize: number;
    partslotComplete: number;
    partslotPending: number;
    aeoPerDay: number;
    ytSearches: number;
    ytVideos: number;
    ytVehicles: number;
    ytJobTypes: number;
    ytQuotaUsed: number;
  };
}

const EMPTY_DATA: FlowData = {
  queue: { seo: 0, partslot: 0, aeo: 0, ytSearches: 0, ytMakes: 0 },
  generating: { seoCount: 0, partslotCount: 0, partslotJobs: [], aeoRunning: false, aeoToday: 0, ytToday: 0 },
  ready: { seo: [], partslot: [], aeo: [], youtube: [] },
  published: { seoTotal: 0, seoToday: 0, seoWeek: 0, seoRecent: [], partslotTotal: 0, aeoTotal: 0, ytVideos: 0, ytVehicles: 0, ytJobTypes: 0 },
  velocity: { seoPerDay: 0, seoQueueSize: 0, partslotComplete: 0, partslotPending: 0, aeoPerDay: 0, ytSearches: 0, ytVideos: 0, ytVehicles: 0, ytJobTypes: 0, ytQuotaUsed: 0 },
};

async function safeQuery<T>(fn: () => Promise<{ data: T | null; error: any }>): Promise<T | null> {
  try {
    const { data, error } = await fn();
    if (error) { console.error(error); return null; }
    return data;
  } catch { return null; }
}

async function fetchFlowData(): Promise<FlowData> {
  const d = structuredClone(EMPTY_DATA);

  // Queue
  const [seoQC, partslotQC, aeoQC, ytLog] = await Promise.all([
    supabase.from('mkt_seo_queue').select('*', { count: 'exact', head: true }).eq('status', 'pending').is('draft_content', null).neq('content_type', 'partslot_aeo'),
    supabase.from('partslot_aeo_queue').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('part_enrichment_staging').select('*', { count: 'exact', head: true }).not('status', 'in', '("pending_review","approved","published","rejected","FLAGGED_POOR_DATA")'),
    supabase.from('youtube_search_log').select('vehicle_make, vehicle_model'),
  ]);
  d.queue.seo = seoQC.count ?? 0;
  d.queue.partslot = partslotQC.count ?? 0;
  d.queue.aeo = aeoQC.count ?? 0;
  if (ytLog) {
    d.queue.ytSearches = (ytLog as any[]).length;
    const makes = new Set((ytLog as any[]).map((r: any) => `${r.vehicle_make}${r.vehicle_model}`));
    d.queue.ytMakes = makes.size;
  }

  // Generating
  const [seoBriefed, partslotGen, emilyRuns, ytToday] = await Promise.all([
    supabase.from('mkt_seo_queue').select('*', { count: 'exact', head: true }).eq('status', 'briefed'),
    supabase.from('partslot_aeo_queue').select('make, model, partslot_description').eq('status', 'generating'),
    supabase.from('emily_runs').select('generated_count').eq('status', 'running').eq('triggered_by', 'api'),
    supabase.from('youtube_search_log').select('*', { count: 'exact', head: true }).gte('searched_at', new Date().toISOString().slice(0, 10)),
  ]);
  d.generating.seoCount = seoBriefed.count ?? 0;
  if (partslotGen.data) {
    d.generating.partslotCount = partslotGen.data.length;
    d.generating.partslotJobs = partslotGen.data.map((r: any) => ({ make: r.make, model: r.model, desc: r.partslot_description }));
  }
  d.generating.aeoRunning = (emilyRuns.data?.length ?? 0) > 0;
  d.generating.ytToday = ytToday.count ?? 0;

  // AEO today
  const aeoTodayQ = await supabase.from('emily_runs').select('generated_count').eq('triggered_by', 'api').gte('started_at', new Date().toISOString().slice(0, 10));
  d.generating.aeoToday = (aeoTodayQ.data || []).reduce((s: number, r: any) => s + (r.generated_count || 0), 0);

  // Ready
  const [readySeo, readyPartslot, readyAeo, readyYt] = await Promise.all([
    supabase.from('mkt_seo_queue').select('id, task_id, title, content_type, category, psyops_stream, draft_content, updated_at')
      .eq('status', 'generated').not('draft_content', 'is', null).neq('content_type', 'partslot_aeo').order('updated_at', { ascending: false }),
    supabase.from('mkt_seo_queue').select('id, task_id, title, category, psyops_stream, draft_content, notes, updated_at')
      .eq('content_type', 'partslot_aeo').not('draft_content', 'is', null).not('status', 'in', '("published","rejected")').order('updated_at', { ascending: false }),
    supabase.from('part_enrichment_staging').select('id, sku, brand, product_type, status, confidence_score, aeo_json, updated_at')
      .eq('status', 'pending_review').order('updated_at', { ascending: false }).limit(50),
    supabase.from('youtube_videos').select('id, title, channel_name, thumbnail_url, is_active, youtube_video_vehicles(job_type, vehicle_id)')
      .eq('is_active', true).order('published_at', { ascending: false }).limit(20),
  ]);
  d.ready.seo = (readySeo.data || []).map((r: any) => ({ ...r, preview: r.draft_content?.slice(0, 200) }));
  d.ready.partslot = (readyPartslot.data || []).map((r: any) => ({ ...r, preview: r.draft_content?.slice(0, 200) }));
  d.ready.aeo = (readyAeo.data || []).map((r: any) => {
    let preview = '';
    try { preview = JSON.parse(r.aeo_json)?.answer_first?.slice(0, 200) || ''; } catch {}
    if (typeof r.aeo_json === 'object' && r.aeo_json) preview = (r.aeo_json as any).answer_first?.slice(0, 200) || '';
    return { ...r, preview, confidencePct: Math.round((r.confidence_score || 0) * 100) };
  });
  // YouTube ready: filter to those without display_rank
  d.ready.youtube = (readyYt.data || []).filter((v: any) => {
    const vehicles = v.youtube_video_vehicles || [];
    return vehicles.some((vv: any) => vv.display_rank == null);
  });

  // Published
  const [pubSeo, pubPartslot, pubAeo, pubYt] = await Promise.all([
    supabase.from('mkt_seo_queue').select('title, published_at').eq('status', 'published').order('published_at', { ascending: false }),
    supabase.from('mkt_seo_queue').select('*', { count: 'exact', head: true }).eq('status', 'published').eq('content_type', 'partslot_aeo'),
    supabase.from('part_enrichment_staging').select('*', { count: 'exact', head: true }).in('status', ['approved', 'published']),
    supabase.from('youtube_videos').select('id, youtube_video_vehicles(vehicle_id, job_type)').eq('is_active', true),
  ]);
  const pubSeoData = pubSeo.data || [];
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  d.published.seoTotal = pubSeoData.length;
  d.published.seoToday = pubSeoData.filter((r: any) => r.published_at?.slice(0, 10) === todayStr).length;
  d.published.seoWeek = pubSeoData.filter((r: any) => r.published_at && new Date(r.published_at) > weekAgo).length;
  d.published.seoRecent = pubSeoData.slice(0, 3).map((r: any) => r.title);
  d.published.partslotTotal = pubPartslot.count ?? 0;
  d.published.aeoTotal = pubAeo.count ?? 0;
  if (pubYt.data) {
    const ranked = pubYt.data.filter((v: any) => (v.youtube_video_vehicles || []).some((vv: any) => vv.display_rank != null));
    d.published.ytVideos = ranked.length;
    const vids = new Set<string>();
    const jts = new Set<string>();
    ranked.forEach((v: any) => (v.youtube_video_vehicles || []).forEach((vv: any) => { if (vv.vehicle_id) vids.add(vv.vehicle_id); if (vv.job_type) jts.add(vv.job_type); }));
    d.published.ytVehicles = vids.size;
    d.published.ytJobTypes = jts.size;
  }

  // Velocity
  d.velocity.seoPerDay = d.published.seoWeek > 0 ? Math.round((d.published.seoWeek / 7) * 10) / 10 : 0;
  d.velocity.seoQueueSize = d.queue.seo;

  const partslotCompleteQ = await supabase.from('partslot_aeo_queue').select('*', { count: 'exact', head: true }).eq('status', 'complete');
  const partslotPendingQ = await supabase.from('partslot_aeo_queue').select('*', { count: 'exact', head: true }).eq('status', 'pending');
  d.velocity.partslotComplete = partslotCompleteQ.count ?? 0;
  d.velocity.partslotPending = partslotPendingQ.count ?? 0;

  const aeoVelQ = await supabase.from('emily_runs').select('generated_count').eq('triggered_by', 'api').gte('started_at', weekAgo.toISOString());
  const aeoTotal7d = (aeoVelQ.data || []).reduce((s: number, r: any) => s + (r.generated_count || 0), 0);
  d.velocity.aeoPerDay = Math.round((aeoTotal7d / 7) * 10) / 10;

  d.velocity.ytSearches = d.queue.ytSearches;
  d.velocity.ytVideos = d.published.ytVideos;
  d.velocity.ytVehicles = d.published.ytVehicles;
  d.velocity.ytJobTypes = d.published.ytJobTypes;
  d.velocity.ytQuotaUsed = d.generating.ytToday;

  return d;
}

// ── Main component ──

export default function Flow() {
  const [data, setData] = useState<FlowData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const d = await fetchFlowData();
    setData(d);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 60000);
    return () => clearInterval(iv);
  }, [load]);

  // Actions
  const publishSeo = async (id: string, title: string) => {
    await supabase.from('mkt_seo_queue').update({ status: 'published', james_approved: true, approved_at: new Date().toISOString(), published_at: new Date().toISOString() }).eq('id', id);
    toast.success(`✓ Published: ${title}`);
    load();
  };

  const publishAllSeo = async () => {
    const count = data.ready.seo.length;
    await supabase.from('mkt_seo_queue').update({ status: 'published', james_approved: true, approved_at: new Date().toISOString(), published_at: new Date().toISOString() })
      .eq('status', 'generated').not('draft_content', 'is', null).neq('content_type', 'partslot_aeo');
    toast.success(`✓ Published ${count} articles`);
    load();
  };

  const publishPartslot = async (id: string, title: string) => {
    await supabase.from('mkt_seo_queue').update({ status: 'published', james_approved: true, approved_at: new Date().toISOString(), published_at: new Date().toISOString() }).eq('id', id);
    toast.success(`✓ Published: ${title}`);
    load();
  };

  const publishAllPartslot = async () => {
    const count = data.ready.partslot.length;
    await supabase.from('mkt_seo_queue').update({ status: 'published', james_approved: true, approved_at: new Date().toISOString(), published_at: new Date().toISOString() })
      .eq('content_type', 'partslot_aeo').not('draft_content', 'is', null).not('status', 'in', '("published","rejected")');
    toast.success(`✓ Published ${count} partslot articles`);
    load();
  };

  const approveAeo = async (id: string, sku: string) => {
    await supabase.from('part_enrichment_staging').update({ status: 'approved', updated_at: new Date().toISOString() }).eq('id', id);
    toast.success(`✓ Approved: ${sku}`);
    load();
  };

  const approveAllAeo = async () => {
    const count = data.ready.aeo.length;
    await supabase.from('part_enrichment_staging').update({ status: 'approved', updated_at: new Date().toISOString() }).eq('status', 'pending_review');
    toast.success(`✓ Approved ${count} SKUs`);
    load();
  };

  const excludeVideo = async (id: string) => {
    await supabase.from('youtube_videos').update({ is_active: false }).eq('id', id);
    toast.success('Video excluded');
    load();
  };

  const rejectItem = async (table: string, id: string) => {
    await supabase.from(table).update({ status: 'rejected' }).eq('id', id);
    toast('Item rejected');
    load();
  };

  const runRankingPass = async () => {
    const { error } = await supabase.rpc('run_youtube_ranking_pass');
    if (error) toast.error('Ranking failed: ' + error.message);
    else toast.success('Ranking complete — videos now ranked by relevance.');
    load();
  };

  const ROW_LABELS = ['QUEUE', 'GENERATING', 'READY', 'PUBLISHED', 'VELOCITY'];

  const channels = [
    { key: 'seo', name: 'SEO ARTICLES', tagline: 'Drive organic search traffic', accent: ACCENTS.seo },
    { key: 'partslot', name: 'PARTSLOT AEO', tagline: 'Vehicle-part guides for every make/model', accent: ACCENTS.partslot },
    { key: 'aeo', name: 'AEO PRODUCT', tagline: 'AI-indexed content for every SKU', accent: ACCENTS.aeo },
    { key: 'youtube', name: 'YOUTUBE', tagline: 'How-to videos for every job type', accent: ACCENTS.youtube },
  ];

  return (
    <div className="p-4 md:p-6 w-full max-w-full overflow-x-auto">
      <PageHeader title="CONTENT FLOW" description="All four channels. Every stage. One view." />

      {loading ? (
        <div className="text-muted-foreground text-center py-20">Loading flow data…</div>
      ) : (
        <div className="grid grid-cols-[80px_1fr_1fr_1fr_1fr] gap-px bg-border rounded-lg overflow-hidden mt-6">

          {/* Header row */}
          <div className="bg-secondary/50 p-2" /> {/* empty corner */}
          {channels.map(ch => (
            <div key={ch.key} className="bg-card p-4" style={{ borderTop: `4px solid ${ch.accent}` }}>
              <h3 className="font-bold text-foreground text-sm">{ch.name}</h3>
              <p className="text-[11px] text-muted-foreground italic">{ch.tagline}</p>
            </div>
          ))}

          {/* ROW 1 — QUEUE */}
          <RowLabel label={ROW_LABELS[0]} />
          <Cell><StatCell value={data.queue.seo} label="articles in queue" /></Cell>
          <Cell><StatCell value={data.queue.partslot} label="jobs in queue" /></Cell>
          <Cell><StatCell value={data.queue.aeo} label="SKUs queued" /></Cell>
          <Cell>
            <StatCell value={data.queue.ytSearches} label={`searches logged · ${data.queue.ytMakes} makes covered`} />
          </Cell>

          {/* ROW 2 — GENERATING */}
          <RowLabel label={ROW_LABELS[1]} />
          <Cell>
            {data.generating.seoCount > 0
              ? <div className="text-sm"><PulsingDot />{data.generating.seoCount} articles being written</div>
              : <div className="text-xs text-muted-foreground">Next run: every 30 min (Mon–Fri)</div>}
          </Cell>
          <Cell>
            {data.generating.partslotCount > 0 ? (
              <div>
                <div className="text-sm"><PulsingDot />{data.generating.partslotCount} in progress</div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {data.generating.partslotJobs.map((j, i) => (
                    <Badge key={i} variant="secondary" className="text-[10px]">{j.make} {j.model} — {j.desc}</Badge>
                  ))}
                </div>
              </div>
            ) : <div className="text-xs text-muted-foreground">Next run: top of the hour</div>}
          </Cell>
          <Cell>
            {data.generating.aeoRunning
              ? <div className="text-sm"><PulsingDot />Batch in progress</div>
              : <div className="text-xs text-muted-foreground">Batch: 3 SKUs × 10 runs/day</div>}
            <div className="text-xs text-muted-foreground mt-1">{data.generating.aeoToday} SKUs enriched today</div>
          </Cell>
          <Cell>
            <div className="text-sm">{data.generating.ytToday} searches today</div>
            <div className="text-xs text-muted-foreground">{Math.max(0, 95 - data.generating.ytToday)} quota remaining</div>
            <div className="text-xs text-muted-foreground mt-1">Batch window: 14:00–15:00 UTC daily</div>
          </Cell>

          {/* ROW 3 — READY ⭐ */}
          <RowLabel label="READY ⭐" />
          <ReadyCell accent={ACCENTS.seo} count={data.ready.seo.length} publishAllLabel="PUBLISH ALL" onPublishAll={publishAllSeo} emptyMsg="Emily is writing. Articles appear here every 30 minutes on weekdays.">
            {data.ready.seo.map((a: any) => (
              <ContentCard key={a.id} title={a.title} category={a.category || a.content_type} stream={a.psyops_stream}
                preview={a.preview} accent={ACCENTS.seo} onPublish={() => publishSeo(a.id, a.title)}
                onReject={() => rejectItem('mkt_seo_queue', a.id)} />
            ))}
          </ReadyCell>
          <ReadyCell accent={ACCENTS.partslot} count={data.ready.partslot.length} publishAllLabel="PUBLISH ALL" onPublishAll={publishAllPartslot} emptyMsg="Partslot pipeline generates vehicle-specific articles hourly.">
            {data.ready.partslot.map((a: any) => (
              <ContentCard key={a.id} title={a.title} category={a.category} stream={a.psyops_stream}
                preview={a.preview} accent={ACCENTS.partslot} onPublish={() => publishPartslot(a.id, a.title)}
                onReject={() => rejectItem('mkt_seo_queue', a.id)} />
            ))}
          </ReadyCell>
          <ReadyCell accent={ACCENTS.aeo} count={data.ready.aeo.length} publishAllLabel={`APPROVE ALL (${data.ready.aeo.length})`} onPublishAll={approveAllAeo} emptyMsg="No AEO product records awaiting review.">
            {data.ready.aeo.map((a: any) => (
              <ContentCard key={a.id} title={`${a.sku} — ${a.brand}`} category={a.product_type}
                preview={a.preview} accent={ACCENTS.aeo} publishLabel="APPROVE" onPublish={() => approveAeo(a.id, a.sku)}
                extra={
                  <Badge className={cn('text-[10px] px-1.5 py-0', a.confidencePct >= 85 ? 'bg-green-600 text-white' : a.confidencePct >= 70 ? 'bg-amber-500 text-white' : 'bg-red-600 text-white')}>
                    {a.confidencePct}% confidence
                  </Badge>
                } />
            ))}
          </ReadyCell>
          <ReadyCell accent={ACCENTS.youtube} count={data.ready.youtube.length} publishAllLabel="RUN RANKING PASS" onPublishAll={runRankingPass} emptyMsg={`All ${data.published.ytVideos} videos ranked.`}>
            {data.ready.youtube.map((v: any) => {
              const veh = v.youtube_video_vehicles?.[0];
              return (
                <ContentCard key={v.id} title={v.title} category={veh?.job_type} preview={v.channel_name}
                  accent={ACCENTS.youtube} publishLabel="EXCLUDE" onPublish={() => excludeVideo(v.id)} />
              );
            })}
          </ReadyCell>

          {/* ROW 4 — PUBLISHED */}
          <RowLabel label={ROW_LABELS[3]} />
          <Cell className="bg-[#052e16]/20">
            <StatCell value={data.published.seoTotal} label="articles published" />
            <div className="text-xs text-muted-foreground mt-2 text-center">Today: {data.published.seoToday} · This week: {data.published.seoWeek}</div>
            {data.published.seoRecent.length > 0 && (
              <div className="mt-2 space-y-0.5">
                {data.published.seoRecent.map((t, i) => <p key={i} className="text-[10px] text-muted-foreground truncate">• {t}</p>)}
              </div>
            )}
          </Cell>
          <Cell className="bg-[#052e16]/20">
            <StatCell value={data.published.partslotTotal} label="partslot articles live" />
          </Cell>
          <Cell className="bg-[#052e16]/20">
            <StatCell value={data.published.aeoTotal} label="SKUs enriched" />
          </Cell>
          <Cell className="bg-[#052e16]/20">
            <StatCell value={data.published.ytVideos} label={`videos ranked · ${data.published.ytVehicles} vehicles · ${data.published.ytJobTypes} job types`} />
          </Cell>

          {/* ROW 5 — VELOCITY */}
          <RowLabel label={ROW_LABELS[4]} />
          <Cell>
            <div className="font-mono text-xs text-foreground">
              {data.velocity.seoPerDay}/day avg (7d) · Est. clearance: {data.velocity.seoPerDay > 0 ? Math.ceil(data.velocity.seoQueueSize / data.velocity.seoPerDay) : '∞'} days
            </div>
          </Cell>
          <Cell>
            <div className="font-mono text-xs text-foreground">
              {data.velocity.partslotComplete} complete · {data.velocity.partslotPending} remaining
            </div>
          </Cell>
          <Cell>
            <div className="font-mono text-xs text-foreground">
              {data.velocity.aeoPerDay}/day avg (7d) · Batch: 3 SKUs × 10 runs/day = 30/day capacity
            </div>
          </Cell>
          <Cell>
            <div className="font-mono text-xs text-foreground">
              {data.velocity.ytSearches} searches · {data.velocity.ytVideos} videos · {data.velocity.ytVehicles} vehicles
            </div>
            <div className="mt-1.5">
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <span>{data.velocity.ytQuotaUsed} / 95 used today</span>
                <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full rounded-full bg-red-500" style={{ width: `${Math.min(100, (data.velocity.ytQuotaUsed / 95) * 100)}%` }} />
                </div>
              </div>
            </div>
          </Cell>
        </div>
      )}
    </div>
  );
}

// ── Grid helpers ──

function RowLabel({ label }: { label: string }) {
  return (
    <div className="bg-secondary/50 flex items-center justify-center p-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground [writing-mode:horizontal-tb] text-center">{label}</span>
    </div>
  );
}

function Cell({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('bg-card p-4 flex flex-col justify-center', className)}>{children}</div>;
}

function ReadyCell({ children, accent, count, publishAllLabel, onPublishAll, emptyMsg }: {
  children: React.ReactNode; accent: string; count: number; publishAllLabel: string; onPublishAll: () => void; emptyMsg: string;
}) {
  return (
    <div className="bg-card/80 p-3 flex flex-col" style={{ minHeight: count > 0 ? 300 : 120 }}>
      <div className="flex items-center justify-between mb-2">
        <Badge variant="outline" className="text-xs">{count} ready</Badge>
        <Button size="sm" className="h-10 w-full ml-2 font-bold text-xs" style={{ backgroundColor: count > 0 ? accent : undefined }}
          disabled={count === 0} onClick={onPublishAll}>{publishAllLabel} ({count})</Button>
      </div>
      {count > 0 ? (
        <ScrollArea className="flex-1 max-h-[300px]">{children}</ScrollArea>
      ) : (
        <p className="text-xs text-muted-foreground italic mt-2">{emptyMsg}</p>
      )}
    </div>
  );
}
