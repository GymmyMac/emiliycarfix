import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface ContentType {
  id: string;
  name: string;
  slug: string;
  description: string;
  brief: string;
  variables: string[];
  target_pool_table: string | null;
  target_count: number;
  cadence: string;
  status: string;
  sort_order: number;
  ga4_sessions: number;
  ga4_page_views: number;
  ga4_avg_duration_sec: number;
  ga4_conversions: number;
  engagement_score: number;
}

interface QueueItem {
  id: string;
  title?: string;
  content_type?: string;
  status?: string;
  created_at?: string;
  word_count?: number;
  vehicle_make?: string;
  vehicle_model?: string;
  year_range?: string;
  part_name?: string;
  keyword?: string;
  platform?: string;
}

const RANK_COLORS = ['#f59e0b', '#94a3b8', '#b45309'];
const RANK_LABELS = ['#1', '#2', '#3'];

const POOL_LABELS: Record<string, string> = {
  'sas_catalogue': 'parts in pool',
  'user_vehicles': 'vehicles in pool',
  'mkt_seo_queue': 'keywords in pool',
  'mkt_content_queue': 'items in pool',
};

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

function fmtDuration(sec: number): string {
  if (!sec) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s}s`;
}

export default function Approvals() {
  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [openBrief, setOpenBrief] = useState<string | null>(null);
  const [openReview, setOpenReview] = useState<string | null>(null);
  const [briefText, setBriefText] = useState('');
  const [savingBrief, setSavingBrief] = useState(false);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const loadContentTypes = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('v_content_type_ga4_stats')
      .select('*')
      .order('sort_order');
    if (!error && data) setContentTypes(data as ContentType[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadContentTypes(); }, [loadContentTypes]);

  const handleOpenBrief = (ct: ContentType) => {
    setOpenReview(null);
    if (openBrief === ct.id) { setOpenBrief(null); return; }
    setOpenBrief(ct.id);
    setBriefText(ct.brief || '');
  };

  const handleSaveBrief = async (ctId: string) => {
    setSavingBrief(true);
    await supabase
      .from('emily_content_types')
      .update({ brief: briefText, updated_at: new Date().toISOString() })
      .eq('id', ctId);
    setSavingBrief(false);
    setOpenBrief(null);
    loadContentTypes();
  };

  const handleOpenReview = async (ct: ContentType) => {
    setOpenBrief(null);
    if (openReview === ct.id) { setOpenReview(null); return; }
    setOpenReview(ct.id);
    setQueueLoading(true);
    setQueueItems([]);
    let table = 'mkt_content_queue';
    if (ct.slug === 'vehicle-wiki') table = 'mkt_seo_queue';
    if (ct.slug === 'aeo-parts') table = 'partslot_aeo_queue';
    if (ct.slug === 'seo-articles') table = 'mkt_seo_queue';
    const { data } = await supabase
      .from(table)
      .select('*')
      .eq('status', 'pending_review')
      .order('created_at', { ascending: false })
      .limit(10);
    setQueueItems((data as QueueItem[]) || []);
    setQueueLoading(false);
  };

  const handleApproveItem = async (item: QueueItem, ct: ContentType) => {
    let table = 'mkt_content_queue';
    if (ct.slug === 'vehicle-wiki') table = 'mkt_seo_queue';
    if (ct.slug === 'aeo-parts') table = 'partslot_aeo_queue';
    await supabase.from(table).update({ status: 'approved' }).eq('id', item.id);
    setQueueItems(prev => prev.filter(i => i.id !== item.id));
  };

  const handleRejectItem = async (item: QueueItem, ct: ContentType) => {
    let table = 'mkt_content_queue';
    if (ct.slug === 'vehicle-wiki') table = 'mkt_seo_queue';
    if (ct.slug === 'aeo-parts') table = 'partslot_aeo_queue';
    await supabase.from(table).update({ status: 'rejected' }).eq('id', item.id);
    setQueueItems(prev => prev.filter(i => i.id !== item.id));
  };

  const handleCadenceChange = async (ctId: string, cadence: string) => {
    await supabase.from('emily_content_types').update({ cadence, updated_at: new Date().toISOString() }).eq('id', ctId);
    setContentTypes(prev => prev.map(ct => ct.id === ctId ? { ...ct, cadence } : ct));
  };

  // Toggle active ↔ paused (or draft → active)
  const handleToggleStatus = async (ct: ContentType) => {
    const newStatus = ct.status === 'active' ? 'paused' : 'active';
    await supabase.from('emily_content_types')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', ct.id);
    setContentTypes(prev => prev.map(c => c.id === ct.id ? { ...c, status: newStatus } : c));
    showToast(`${ct.name} ${newStatus === 'active' ? 'enabled' : 'paused'}`);
  };

  // Write a run trigger — AG/Emily picks this up and generates one batch
  const handleRunOne = async (ct: ContentType) => {
    if (runningIds.has(ct.id)) return;
    setRunningIds(prev => new Set([...prev, ct.id]));
    await supabase.from('emily_run_triggers').insert({
      content_type_id: ct.id,
      content_type_slug: ct.slug,
      status: 'pending',
    });
    showToast(`Run triggered for ${ct.name} — Emily will pick this up shortly`);
    setTimeout(() => {
      setRunningIds(prev => { const n = new Set(prev); n.delete(ct.id); return n; });
    }, 8000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-sm text-gray-500">Loading pipeline...</div>
      </div>
    );
  }

  const ranked = [...contentTypes]
    .filter(ct => ct.ga4_sessions > 0)
    .sort((a, b) => b.engagement_score - a.engagement_score);

  const active = contentTypes.filter(ct => ct.status === 'active' || ct.status === 'paused');
  const draft = contentTypes.filter(ct => ct.status === 'draft');

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">

      {/* Toast */}
      {toastMsg && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white text-xs px-4 py-2 rounded-lg shadow-lg transition-opacity">
          {toastMsg}
        </div>
      )}

      {/* ── SCOREBOARD ── */}
      <div>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-medium text-gray-900">Content performance</h2>
          <span className="text-xs text-gray-400">ranked by engagement score · GA4 data</span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {contentTypes.map((ct) => {
            const rank = ranked.findIndex(r => r.id === ct.id);
            const rankColor = rank >= 0 && rank < 3 ? RANK_COLORS[rank] : undefined;
            const poolLabel = ct.target_pool_table ? (POOL_LABELS[ct.target_pool_table] || 'in pool') : null;
            const barPct = ct.engagement_score;
            const isNew = ct.ga4_sessions === 0;

            return (
              <div
                key={ct.id}
                className="rounded-lg border bg-white p-3 relative"
                style={{ borderColor: rankColor || '#e5e7eb' }}
              >
                {rank >= 0 && rank < 3 && (
                  <div className="absolute top-2 right-2 text-xs font-medium" style={{ color: rankColor }}>
                    {RANK_LABELS[rank]}
                  </div>
                )}
                <div className="text-xs font-medium text-gray-900 pr-5 leading-snug mb-2">{ct.name}</div>

                {isNew ? (
                  <div className="text-xs text-gray-400 mb-2">not started</div>
                ) : (
                  <div className="text-xl font-medium text-gray-900 leading-none mb-0.5">{ct.engagement_score}</div>
                )}
                <div className="text-xs text-gray-400 mb-2">{isNew ? '' : 'score'}</div>

                <div className="h-0.5 rounded-full bg-gray-100 mb-2">
                  <div className="h-0.5 rounded-full transition-all" style={{ width: `${barPct}%`, background: rankColor || '#9ca3af' }} />
                </div>

                <div className="flex justify-between text-xs text-gray-500">
                  <span>{fmt(ct.ga4_sessions)} <span className="text-gray-400">sess</span></span>
                  <span>{fmtDuration(ct.ga4_avg_duration_sec)}</span>
                </div>

                {ct.target_count > 0 && poolLabel && (
                  <div className="mt-2 text-xs text-gray-400 border-t border-gray-100 pt-2">
                    {isNew
                      ? <span className="text-purple-600 font-medium">set up to start</span>
                      : <span>{fmt(Math.max(0, ct.target_count - ct.ga4_page_views))} {poolLabel} remaining</span>
                    }
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── PIPELINE ── */}
      <div>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-medium text-gray-900">Production pipeline</h2>
          <span className="text-xs text-gray-400">Emily runs daily at 6am</span>
        </div>

        {/* Column headers */}
        <div className="grid items-center mb-1 px-3" style={{ gridTemplateColumns: '1fr 100px 80px 80px 80px 110px 100px' }}>
          <div className="text-xs text-purple-600 border-b-2 border-purple-400 pb-1">content type · one brief</div>
          <div className="text-xs text-amber-600 border-b-2 border-amber-400 pb-1 text-center">generating</div>
          <div className="text-xs text-blue-600 border-b-2 border-blue-400 pb-1 text-center">to review</div>
          <div className="text-xs text-emerald-600 border-b-2 border-emerald-400 pb-1 text-center">approved</div>
          <div className="text-xs text-gray-400 border-b-2 border-gray-200 pb-1 text-center">live</div>
          <div className="text-xs text-gray-400 pb-1 text-center">cadence</div>
          <div className="text-xs text-gray-400 pb-1 text-right">controls</div>
        </div>

        <div className="space-y-1.5">
          {active.map(ct => (
            <PipelineRow
              key={ct.id}
              ct={ct}
              openBrief={openBrief}
              openReview={openReview}
              briefText={briefText}
              setBriefText={setBriefText}
              savingBrief={savingBrief}
              queueItems={queueItems}
              queueLoading={queueLoading}
              isRunning={runningIds.has(ct.id)}
              onOpenBrief={handleOpenBrief}
              onSaveBrief={handleSaveBrief}
              onOpenReview={handleOpenReview}
              onApprove={handleApproveItem}
              onReject={handleRejectItem}
              onCadenceChange={handleCadenceChange}
              onToggleStatus={handleToggleStatus}
              onRunOne={handleRunOne}
            />
          ))}

          {draft.length > 0 && (
            <>
              <div className="pt-2 pb-1">
                <span className="text-xs text-gray-400">not yet configured</span>
              </div>
              {draft.map(ct => (
                <PipelineRow
                  key={ct.id}
                  ct={ct}
                  openBrief={openBrief}
                  openReview={openReview}
                  briefText={briefText}
                  setBriefText={setBriefText}
                  savingBrief={savingBrief}
                  queueItems={queueItems}
                  queueLoading={queueLoading}
                  isRunning={false}
                  onOpenBrief={handleOpenBrief}
                  onSaveBrief={handleSaveBrief}
                  onOpenReview={handleOpenReview}
                  onApprove={handleApproveItem}
                  onReject={handleRejectItem}
                  onCadenceChange={handleCadenceChange}
                  onToggleStatus={handleToggleStatus}
                  onRunOne={handleRunOne}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface RowProps {
  ct: ContentType;
  openBrief: string | null;
  openReview: string | null;
  briefText: string;
  setBriefText: (v: string) => void;
  savingBrief: boolean;
  queueItems: QueueItem[];
  queueLoading: boolean;
  isRunning: boolean;
  onOpenBrief: (ct: ContentType) => void;
  onSaveBrief: (id: string) => void;
  onOpenReview: (ct: ContentType) => void;
  onApprove: (item: QueueItem, ct: ContentType) => void;
  onReject: (item: QueueItem, ct: ContentType) => void;
  onCadenceChange: (id: string, cadence: string) => void;
  onToggleStatus: (ct: ContentType) => void;
  onRunOne: (ct: ContentType) => void;
}

function PipelineRow({
  ct, openBrief, openReview, briefText, setBriefText, savingBrief,
  queueItems, queueLoading, isRunning,
  onOpenBrief, onSaveBrief, onOpenReview, onApprove, onReject, onCadenceChange,
  onToggleStatus, onRunOne,
}: RowProps) {
  const isDraft = ct.status === 'draft';
  const isPaused = ct.status === 'paused';
  const briefOpen = openBrief === ct.id;
  const reviewOpen = openReview === ct.id;

  return (
    <div>
      {/* Main row */}
      <div
        className={`rounded-lg border bg-white overflow-hidden transition-colors ${
          isDraft ? 'opacity-60 border-dashed' : isPaused ? 'opacity-70' : 'hover:border-gray-300'
        }`}
        style={{ borderColor: isDraft ? '#d1d5db' : isPaused ? '#fbbf24' : '#e5e7eb' }}
      >
        <div className="grid items-center px-3 py-2.5" style={{ gridTemplateColumns: '1fr 100px 80px 80px 80px 110px 100px' }}>

          {/* Name + brief button */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <div className="text-sm font-medium text-gray-900 truncate">{ct.name}</div>
                {isPaused && <span className="text-xs text-amber-500 font-medium">paused</span>}
              </div>
              <div className="text-xs text-gray-400 truncate">{ct.description}</div>
            </div>
            <button
              onClick={() => onOpenBrief(ct)}
              className={`flex-shrink-0 text-xs px-2 py-0.5 rounded border transition-colors ${
                briefOpen
                  ? 'border-purple-400 text-purple-700 bg-purple-50'
                  : 'border-gray-200 text-gray-400 hover:border-purple-300 hover:text-purple-600'
              }`}
            >
              brief
            </button>
          </div>

          {/* Generating */}
          <div className="text-center">
            <span className="text-sm font-medium text-amber-600">—</span>
          </div>

          {/* To review */}
          <div className="text-center">
            {isDraft ? (
              <span className="text-sm text-gray-300">—</span>
            ) : (
              <button
                onClick={() => onOpenReview(ct)}
                className={`text-sm font-medium transition-colors ${reviewOpen ? 'text-blue-700' : 'text-blue-500 hover:text-blue-700 underline underline-offset-2'}`}
              >
                {reviewOpen ? '—' : '?'}
              </button>
            )}
          </div>

          {/* Approved */}
          <div className="text-center">
            <span className="text-sm font-medium text-emerald-600">—</span>
          </div>

          {/* Live */}
          <div className="text-center">
            <span className="text-sm text-gray-400">{fmt(ct.ga4_page_views)}</span>
          </div>

          {/* Cadence */}
          <div className="flex justify-center">
            {isDraft ? (
              <span className="text-xs text-gray-300">not set</span>
            ) : (
              <select
                value={ct.cadence}
                onChange={e => onCadenceChange(ct.id, e.target.value)}
                className="text-xs border border-gray-200 rounded px-1.5 py-0.5 bg-gray-50 text-gray-500 cursor-pointer"
              >
                <option value="batch">batch all</option>
                <option value="5/day">5 / day</option>
                <option value="10/day">10 / day</option>
                <option value="50/day">50 / day</option>
                <option value="3/week">3 / week</option>
                <option value="weekly">weekly</option>
                <option value="daily">daily</option>
                <option value="on trigger">on trigger</option>
                <option value="paused">paused</option>
              </select>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center justify-end gap-1.5">
            {/* Enable / Pause toggle */}
            <button
              onClick={() => onToggleStatus(ct)}
              title={ct.status === 'active' ? 'Pause this content type' : 'Enable this content type'}
              className={`text-xs px-2 py-1 rounded border transition-colors ${
                ct.status === 'active'
                  ? 'border-gray-200 text-gray-400 hover:border-amber-300 hover:text-amber-600 hover:bg-amber-50'
                  : 'border-emerald-300 text-emerald-600 bg-emerald-50 hover:bg-emerald-100'
              }`}
            >
              {ct.status === 'active' ? '⏸' : '▶'}
            </button>

            {/* Run one now */}
            {!isDraft && (
              <button
                onClick={() => onRunOne(ct)}
                disabled={isRunning}
                title="Trigger one run now"
                className={`text-xs px-2 py-1 rounded border transition-colors ${
                  isRunning
                    ? 'border-purple-200 text-purple-400 bg-purple-50 cursor-not-allowed'
                    : 'border-gray-200 text-gray-400 hover:border-purple-300 hover:text-purple-600 hover:bg-purple-50'
                }`}
              >
                {isRunning ? '…' : '▷ run'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Brief editor */}
      {briefOpen && (
        <div className="mt-1 rounded-lg border border-purple-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
            <span className="text-xs font-medium text-gray-700">{ct.name} — master brief</span>
            <button onClick={() => onOpenBrief(ct)} className="text-xs text-gray-400 hover:text-gray-600">✕ close</button>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">instruction to Emily — applies to every instance</label>
              <textarea
                value={briefText}
                onChange={e => setBriefText(e.target.value)}
                rows={6}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-800 resize-y focus:outline-none focus:border-purple-300"
              />
            </div>
            {ct.variables && ct.variables.length > 0 && (
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">available variables</label>
                <div className="flex flex-wrap gap-1.5">
                  {ct.variables.map((v: string) => (
                    <span key={v} className="text-xs font-mono px-2 py-0.5 bg-gray-100 rounded text-gray-500">{`{${v}}`}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-t border-gray-100">
            <span className="text-xs text-gray-400">changes apply to future instances only</span>
            <button
              onClick={() => onSaveBrief(ct.id)}
              disabled={savingBrief}
              className="text-xs px-4 py-1.5 rounded border border-purple-300 text-purple-700 hover:bg-purple-50 disabled:opacity-50"
            >
              {savingBrief ? 'saving...' : 'save brief'}
            </button>
          </div>
        </div>
      )}

      {/* Review queue */}
      {reviewOpen && (
        <div className="mt-1 rounded-lg border border-blue-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
            <span className="text-xs font-medium text-gray-700">
              {ct.name} — {queueLoading ? 'loading...' : queueItems.length === 0 ? 'nothing in review queue' : `${queueItems.length} items to review`}
            </span>
            <button onClick={() => onOpenReview(ct)} className="text-xs text-gray-400 hover:text-gray-600">✕ close</button>
          </div>
          {queueLoading ? (
            <div className="px-4 py-6 text-center text-xs text-gray-400">Loading queue...</div>
          ) : queueItems.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-gray-400">
              No items pending review. Emily will populate this queue on her next run.
            </div>
          ) : (
            <>
              {queueItems.map(item => (
                <div key={item.id} className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-0">
                  <div>
                    <div className="text-sm text-gray-800">
                      {item.title || item.part_name || item.keyword || `${item.vehicle_make || ''} ${item.vehicle_model || ''} ${item.year_range || ''}`.trim() || item.id}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {item.created_at ? new Date(item.created_at).toLocaleString() : ''}
                      {item.word_count ? ` · ${item.word_count} words` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => onReject(item, ct)}
                      className="text-xs px-3 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50"
                    >reject</button>
                    <button
                      onClick={() => onApprove(item, ct)}
                      className="text-xs px-3 py-1 rounded border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                    >approve</button>
                  </div>
                </div>
              ))}
              {queueItems.length > 0 && (
                <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 flex justify-end">
                  <button
                    onClick={() => queueItems.forEach(item => onApprove(item, ct))}
                    className="text-xs px-4 py-1.5 rounded border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                  >approve all {queueItems.length}</button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
