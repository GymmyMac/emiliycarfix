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
  pipeline_generating: number;
  pipeline_to_review: number;
  pipeline_approved: number;
  pipeline_published: number;
}

interface QueueItem {
  id: string;
  // mkt_seo_queue fields
  title?: string;
  target_keyword?: string;
  draft_content?: string;
  content_type?: string;
  // mkt_content_queue fields
  draft_copy?: string;
  platform?: string;
  psyops_phase?: string;
  // shared
  status?: string;
  created_at?: string;
}

interface ChannelStat {
  platform: string;
  to_review: number;
  approved: number;
  published: number;
}

const RANK_COLORS = ['#f59e0b', '#94a3b8', '#b45309'];
const RANK_LABELS = ['#1', '#2', '#3'];
const PLATFORM_ICONS: Record<string, string> = {
  facebook: 'FB', instagram: 'IG', tiktok: 'TK', linkedin: 'LI', sms: 'SMS', email: 'EM', canva: 'CV',
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

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// Which source table and status filter for "to review" per content type
async function fetchReviewItems(ct: ContentType, platformFilter?: string): Promise<QueueItem[]> {
  if (ct.slug === 'vehicle-wiki') {
    const { data } = await supabase.from('mkt_seo_queue')
      .select('id, title, target_keyword, draft_content, created_at, status, content_type')
      .eq('content_type', 'fitment_guide').eq('status', 'generated').eq('james_approved', false)
      .order('created_at', { ascending: false }).limit(10);
    return (data || []) as QueueItem[];
  }
  if (ct.slug === 'seo-articles') {
    const { data } = await supabase.from('mkt_seo_queue')
      .select('id, title, target_keyword, draft_content, created_at, status, content_type')
      .in('content_type', ['seo_article', 'ai_article', 'decision_page', 'regional_seo'])
      .eq('status', 'generated').eq('james_approved', false)
      .order('created_at', { ascending: false }).limit(10);
    return (data || []) as QueueItem[];
  }
  if (ct.slug === 'social-posts') {
    let query = supabase.from('mkt_content_queue')
      .select('id, draft_copy, platform, content_type, psyops_phase, created_at, status')
      .eq('content_type', 'social_post').eq('status', 'pending')
      .order('created_at', { ascending: false }).limit(10);
    if (platformFilter) query = query.eq('platform', platformFilter);
    const { data } = await query;
    return (data || []) as QueueItem[];
  }
  if (ct.slug === 'email-campaigns') {
    const { data } = await supabase.from('mkt_content_queue')
      .select('id, draft_copy, platform, content_type, created_at, status')
      .eq('content_type', 'email').eq('status', 'pending')
      .order('created_at', { ascending: false }).limit(10);
    return (data || []) as QueueItem[];
  }
  if (ct.slug === 'reddit') {
    const { data } = await supabase.from('mkt_seo_queue')
      .select('id, title, target_keyword, draft_content, created_at, status, content_type')
      .eq('content_type', 'reddit')
      .in('status', ['pending', 'generated'])
      .eq('james_approved', false)
      .order('created_at', { ascending: false }).limit(10);
    return (data || []) as QueueItem[];
  }
  return [];
}

async function approveItem(item: QueueItem, ct: ContentType) {
  if (ct.slug === 'vehicle-wiki' || ct.slug === 'seo-articles' || ct.slug === 'reddit') {
    await supabase.from('mkt_seo_queue')
      .update({ status: 'approved', james_approved: true, approved_at: new Date().toISOString() })
      .eq('id', item.id);
  } else {
    await supabase.from('mkt_content_queue')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .eq('id', item.id);
  }
}

async function rejectItem(item: QueueItem, ct: ContentType) {
  if (ct.slug === 'vehicle-wiki' || ct.slug === 'seo-articles' || ct.slug === 'reddit') {
    await supabase.from('mkt_seo_queue').update({ status: 'rejected' }).eq('id', item.id);
  } else {
    await supabase.from('mkt_content_queue').update({ status: 'archived' }).eq('id', item.id);
  }
}

export default function Approvals() {
  const [contentTypes, setContentTypes] = useState<ContentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [openBrief, setOpenBrief] = useState<string | null>(null);
  const [briefText, setBriefText] = useState('');
  const [savingBrief, setSavingBrief] = useState(false);
  const [openReview, setOpenReview] = useState<string | null>(null);
  const [reviewPlatform, setReviewPlatform] = useState<string | null>(null);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [openChannels, setOpenChannels] = useState<string | null>(null);
  const [channelStats, setChannelStats] = useState<ChannelStat[]>([]);
  const [channelLoading, setChannelLoading] = useState(false);
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newBrief, setNewBrief] = useState('');
  const [newCadence, setNewCadence] = useState('paused');
  const [savingNew, setSavingNew] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) => setExpandedItems(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const loadContentTypes = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('v_content_type_ga4_stats').select('*').order('sort_order');
    if (!error && data) setContentTypes(data as ContentType[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadContentTypes(); }, [loadContentTypes]);

  const handleOpenBrief = (ct: ContentType) => {
    setOpenReview(null); setOpenChannels(null);
    if (openBrief === ct.id) { setOpenBrief(null); return; }
    setOpenBrief(ct.id);
    setBriefText(ct.brief || '');
  };

  const handleSaveBrief = async (ctId: string) => {
    setSavingBrief(true);
    await supabase.from('emily_content_types').update({ brief: briefText, updated_at: new Date().toISOString() }).eq('id', ctId);
    setSavingBrief(false);
    setOpenBrief(null);
    loadContentTypes();
  };

  const handleOpenReview = async (ct: ContentType, platformFilter?: string) => {
    setOpenBrief(null); setOpenChannels(null);
    const isSamePlatform = openReview === ct.id && reviewPlatform === (platformFilter || null);
    if (isSamePlatform) { setOpenReview(null); setReviewPlatform(null); return; }
    setOpenReview(ct.id);
    setReviewPlatform(platformFilter || null);
    setQueueLoading(true);
    setQueueItems([]);
    const items = await fetchReviewItems(ct, platformFilter);
    setQueueItems(items);
    setQueueLoading(false);
  };

  const handleOpenChannels = async (ct: ContentType) => {
    setOpenBrief(null); setOpenReview(null);
    if (openChannels === ct.id) { setOpenChannels(null); return; }
    setOpenChannels(ct.id);
    setChannelLoading(true);
    setChannelStats([]);
    const { data } = await supabase.from('mkt_content_queue')
      .select('platform, status').eq('content_type', 'social_post').neq('status', 'archived');
    if (data) {
      const platforms = ['facebook', 'instagram', 'tiktok', 'linkedin'];
      const stats = platforms.map(platform => ({
        platform,
        to_review: data.filter(r => r.platform === platform && r.status === 'pending').length,
        approved: data.filter(r => r.platform === platform && r.status === 'approved').length,
        published: data.filter(r => r.platform === platform && r.status === 'published').length,
      })).filter(s => s.to_review + s.approved + s.published > 0);
      setChannelStats(stats);
    }
    setChannelLoading(false);
  };

  const handleApproveItem = async (item: QueueItem, ct: ContentType) => {
    await approveItem(item, ct);
    setQueueItems(prev => prev.filter(i => i.id !== item.id));
    loadContentTypes();
  };

  const handleRejectItem = async (item: QueueItem, ct: ContentType) => {
    await rejectItem(item, ct);
    setQueueItems(prev => prev.filter(i => i.id !== item.id));
    loadContentTypes();
  };

  const handleCadenceChange = async (ctId: string, cadence: string) => {
    await supabase.from('emily_content_types').update({ cadence, updated_at: new Date().toISOString() }).eq('id', ctId);
    setContentTypes(prev => prev.map(ct => ct.id === ctId ? { ...ct, cadence } : ct));
  };

  const handleToggleStatus = async (ct: ContentType) => {
    const newStatus = ct.status === 'active' ? 'paused' : 'active';
    await supabase.from('emily_content_types').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', ct.id);
    setContentTypes(prev => prev.map(c => c.id === ct.id ? { ...c, status: newStatus } : c));
    showToast(`${ct.name} ${newStatus === 'active' ? 'enabled' : 'paused'}`);
  };

  const handleRunOne = async (ct: ContentType) => {
    if (runningIds.has(ct.id)) return;
    setRunningIds(prev => new Set([...prev, ct.id]));
    await supabase.from('emily_run_triggers').insert({ content_type_id: ct.id, content_type_slug: ct.slug, status: 'pending' });
    showToast(`Run triggered for ${ct.name}`);
    setTimeout(() => setRunningIds(prev => { const n = new Set(prev); n.delete(ct.id); return n; }), 8000);
  };

  const handleCreateContentType = async () => {
    if (!newName.trim()) return;
    setSavingNew(true);
    const maxOrder = contentTypes.length > 0 ? Math.max(...contentTypes.map(ct => ct.sort_order)) : 0;
    await supabase.from('emily_content_types').insert({
      name: newName.trim(),
      slug: slugify(newName.trim()),
      description: newDescription.trim(),
      brief: newBrief.trim(),
      cadence: newCadence,
      status: 'draft',
      sort_order: maxOrder + 1,
      variables: [],
    });
    setSavingNew(false);
    setShowNewForm(false);
    setNewName(''); setNewDescription(''); setNewBrief(''); setNewCadence('paused');
    loadContentTypes();
    showToast('Content type created — it starts in draft until you activate it');
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-sm text-gray-500">Loading pipeline...</div>;

  const ranked = [...contentTypes].filter(ct => ct.ga4_sessions > 0).sort((a, b) => b.engagement_score - a.engagement_score);
  const active = contentTypes.filter(ct => ct.status === 'active' || ct.status === 'paused');
  const draft = contentTypes.filter(ct => ct.status === 'draft');

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">

      {toastMsg && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white text-xs px-4 py-2 rounded-lg shadow-lg">
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
            const isNew = ct.ga4_sessions === 0;
            const isGenerating = ct.pipeline_generating > 0;

            return (
              <div key={ct.id} className="rounded-lg border bg-white p-3 relative overflow-hidden"
                style={{ borderColor: rankColor || '#e5e7eb' }}>
                {rank >= 0 && rank < 3 && (
                  <div className="absolute top-2 right-2 text-xs font-medium" style={{ color: rankColor }}>{RANK_LABELS[rank]}</div>
                )}
                {/* Pulsing "Emily is working" indicator */}
                {isGenerating && (
                  <div className="absolute top-2 left-2 flex items-center gap-1">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                    </span>
                  </div>
                )}
                <div className={`text-xs font-medium text-gray-900 leading-snug mb-2 ${rank >= 0 && rank < 3 ? 'pr-5' : ''} ${isGenerating ? 'pl-4' : ''}`}>{ct.name}</div>
                {isNew ? (
                  <div className="text-xs text-gray-400 mb-2">not started</div>
                ) : (
                  <div className="text-xl font-medium text-gray-900 leading-none mb-0.5">{ct.engagement_score}</div>
                )}
                <div className="text-xs text-gray-400 mb-2">{isNew ? '' : 'score'}</div>
                <div className="h-0.5 rounded-full bg-gray-100 mb-2">
                  <div className={`h-0.5 rounded-full transition-all ${isGenerating ? 'animate-pulse' : ''}`}
                    style={{ width: `${ct.engagement_score}%`, background: rankColor || '#9ca3af' }} />
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{fmt(ct.ga4_sessions)} <span className="text-gray-400">sess</span></span>
                  <span>{fmtDuration(ct.ga4_avg_duration_sec)}</span>
                </div>
                {isGenerating && (
                  <div className="mt-2 text-xs text-amber-600 border-t border-amber-100 pt-2 font-medium">
                    ⚡ {ct.pipeline_generating} generating now
                  </div>
                )}
                {/* Animated stripe at bottom when generating */}
                {isGenerating && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-amber-300 via-amber-500 to-amber-300 animate-pulse" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── PIPELINE ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-gray-900">Production pipeline</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">Emily runs daily at 6am</span>
            <button
              onClick={() => setShowNewForm(v => !v)}
              className={`text-xs px-3 py-1.5 rounded border transition-colors ${showNewForm ? 'border-purple-400 text-purple-700 bg-purple-50' : 'border-gray-200 text-gray-500 hover:border-purple-300 hover:text-purple-600'}`}
            >
              + new content type
            </button>
          </div>
        </div>

        {showNewForm && (
          <div className="mb-4 rounded-lg border border-purple-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
              <span className="text-xs font-medium text-gray-700">New content type</span>
              <button onClick={() => setShowNewForm(false)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="p-4 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Name <span className="text-red-400">*</span></label>
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. YouTube scripts"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:border-purple-300"
                />
                {newName && (
                  <div className="text-xs text-gray-400 mt-1">slug: <span className="font-mono">{slugify(newName)}</span></div>
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Cadence</label>
                <select
                  value={newCadence}
                  onChange={e => setNewCadence(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-600 bg-white focus:outline-none focus:border-purple-300"
                >
                  <option value="paused">paused</option>
                  <option value="daily">daily</option>
                  <option value="3/week">3 / week</option>
                  <option value="weekly">weekly</option>
                  <option value="5/day">5 / day</option>
                  <option value="10/day">10 / day</option>
                  <option value="on trigger">on trigger</option>
                  <option value="batch">batch all</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-400 mb-1">Description <span className="text-gray-300">(one line)</span></label>
                <input
                  value={newDescription}
                  onChange={e => setNewDescription(e.target.value)}
                  placeholder="e.g. Short-form video scripts for the CARFIX YouTube channel"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-800 focus:outline-none focus:border-purple-300"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-400 mb-1">Brief <span className="text-gray-300">(instruction to Emily)</span></label>
                <textarea
                  value={newBrief}
                  onChange={e => setNewBrief(e.target.value)}
                  rows={4}
                  placeholder="Describe what Emily should generate, the tone, format, and any CARFIX-specific angles..."
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-800 resize-y focus:outline-none focus:border-purple-300"
                />
              </div>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-t border-gray-100">
              <span className="text-xs text-gray-400">Saved as draft — activate it from the pipeline once the brief is ready</span>
              <button
                onClick={handleCreateContentType}
                disabled={savingNew || !newName.trim()}
                className="text-xs px-4 py-1.5 rounded border border-purple-300 text-purple-700 hover:bg-purple-50 disabled:opacity-50"
              >
                {savingNew ? 'creating...' : 'create content type'}
              </button>
            </div>
          </div>
        )}

        <div className="grid items-center mb-1 px-3" style={{ gridTemplateColumns: '1fr 110px 80px 80px 70px 110px 100px' }}>
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
            <PipelineRow key={ct.id} ct={ct}
              openBrief={openBrief} openReview={openReview} reviewPlatform={reviewPlatform}
              openChannels={openChannels} channelStats={channelStats} channelLoading={channelLoading}
              briefText={briefText} setBriefText={setBriefText} savingBrief={savingBrief}
              queueItems={queueItems} queueLoading={queueLoading}
              isRunning={runningIds.has(ct.id)}
              onOpenBrief={handleOpenBrief} onSaveBrief={handleSaveBrief}
              onOpenReview={handleOpenReview} onOpenChannels={handleOpenChannels}
              onApprove={handleApproveItem} onReject={handleRejectItem}
              onCadenceChange={handleCadenceChange} onToggleStatus={handleToggleStatus} onRunOne={handleRunOne}
              expandedItems={expandedItems} onToggleExpand={toggleExpand}
            />
          ))}
          {draft.length > 0 && (
            <>
              <div className="pt-2 pb-1"><span className="text-xs text-gray-400">not yet configured</span></div>
              {draft.map(ct => (
                <PipelineRow key={ct.id} ct={ct}
                  openBrief={openBrief} openReview={openReview} reviewPlatform={reviewPlatform}
                  openChannels={openChannels} channelStats={channelStats} channelLoading={channelLoading}
                  briefText={briefText} setBriefText={setBriefText} savingBrief={savingBrief}
                  queueItems={queueItems} queueLoading={queueLoading} isRunning={false}
                  onOpenBrief={handleOpenBrief} onSaveBrief={handleSaveBrief}
                  onOpenReview={handleOpenReview} onOpenChannels={handleOpenChannels}
                  onApprove={handleApproveItem} onReject={handleRejectItem}
                  onCadenceChange={handleCadenceChange} onToggleStatus={handleToggleStatus} onRunOne={handleRunOne}
                  expandedItems={expandedItems} onToggleExpand={toggleExpand}
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
  openBrief: string | null; openReview: string | null; reviewPlatform: string | null;
  openChannels: string | null; channelStats: ChannelStat[]; channelLoading: boolean;
  briefText: string; setBriefText: (v: string) => void; savingBrief: boolean;
  queueItems: QueueItem[]; queueLoading: boolean; isRunning: boolean;
  onOpenBrief: (ct: ContentType) => void;
  onSaveBrief: (id: string) => void;
  onOpenReview: (ct: ContentType, platform?: string) => void;
  onOpenChannels: (ct: ContentType) => void;
  onApprove: (item: QueueItem, ct: ContentType) => void;
  onReject: (item: QueueItem, ct: ContentType) => void;
  onCadenceChange: (id: string, cadence: string) => void;
  onToggleStatus: (ct: ContentType) => void;
  onRunOne: (ct: ContentType) => void;
  expandedItems: Set<string>;
  onToggleExpand: (id: string) => void;
}

function PipelineRow({
  ct, openBrief, openReview, reviewPlatform, openChannels, channelStats, channelLoading,
  briefText, setBriefText, savingBrief, queueItems, queueLoading, isRunning,
  onOpenBrief, onSaveBrief, onOpenReview, onOpenChannels,
  onApprove, onReject, onCadenceChange, onToggleStatus, onRunOne,
  expandedItems, onToggleExpand,
}: RowProps) {
  const isDraft = ct.status === 'draft';
  const isPaused = ct.status === 'paused';
  const isGenerating = ct.pipeline_generating > 0;
  const briefOpen = openBrief === ct.id;
  const reviewOpen = openReview === ct.id;
  const channelsOpen = openChannels === ct.id;
  const isSocialPosts = ct.slug === 'social-posts';

  const liveCount = ct.pipeline_published > 0 ? ct.pipeline_published : ct.ga4_page_views;

  return (
    <div>
      <div className={`rounded-lg border bg-white overflow-hidden transition-colors ${isDraft ? 'opacity-60 border-dashed' : isPaused ? 'opacity-70' : 'hover:border-gray-300'}`}
        style={{ borderColor: isDraft ? '#d1d5db' : isPaused ? '#fbbf24' : '#e5e7eb' }}>
        <div className="grid items-center px-3 py-2.5" style={{ gridTemplateColumns: '1fr 110px 80px 80px 70px 110px 100px' }}>

          {/* Name */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <div className="text-sm font-medium text-gray-900 truncate">{ct.name}</div>
                {isPaused && <span className="text-xs text-amber-500 font-medium">paused</span>}
              </div>
              <div className="text-xs text-gray-400 truncate">{ct.description}</div>
            </div>
            <button onClick={() => onOpenBrief(ct)}
              className={`flex-shrink-0 text-xs px-2 py-0.5 rounded border transition-colors ${briefOpen ? 'border-purple-400 text-purple-700 bg-purple-50' : 'border-gray-200 text-gray-400 hover:border-purple-300 hover:text-purple-600'}`}>
              brief
            </button>
          </div>

          {/* Generating */}
          <div className="flex items-center justify-center gap-1.5">
            {isGenerating ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
                <span className="text-sm font-medium text-amber-600">{fmt(ct.pipeline_generating)}</span>
              </>
            ) : (
              <span className="text-sm text-gray-300">—</span>
            )}
          </div>

          {/* To Review */}
          <div className="text-center">
            {isDraft ? (
              <span className="text-sm text-gray-300">—</span>
            ) : ct.pipeline_to_review > 0 ? (
              <button onClick={() => onOpenReview(ct)}
                className={`text-sm font-medium transition-colors ${reviewOpen && !reviewPlatform ? 'text-blue-700' : 'text-blue-500 hover:text-blue-700 underline underline-offset-2'}`}>
                {ct.pipeline_to_review}
              </button>
            ) : (
              <span className="text-sm text-gray-300">—</span>
            )}
          </div>

          {/* Approved */}
          <div className="text-center">
            {ct.pipeline_approved > 0 ? (
              <span className="text-sm font-medium text-emerald-600">{fmt(ct.pipeline_approved)}</span>
            ) : (
              <span className="text-sm text-gray-300">—</span>
            )}
          </div>

          {/* Live */}
          <div className="text-center">
            {liveCount > 0 ? (
              <span className="text-sm text-gray-500">{fmt(liveCount)}</span>
            ) : (
              <span className="text-sm text-gray-300">—</span>
            )}
          </div>

          {/* Cadence */}
          <div className="flex justify-center">
            {isDraft ? (
              <span className="text-xs text-gray-300">not set</span>
            ) : (
              <select value={ct.cadence} onChange={e => onCadenceChange(ct.id, e.target.value)}
                className="text-xs border border-gray-200 rounded px-1.5 py-0.5 bg-gray-50 text-gray-500 cursor-pointer">
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
          <div className="flex items-center justify-end gap-1">
            {isSocialPosts && !isDraft && (
              <button onClick={() => onOpenChannels(ct)} title="View channels"
                className={`text-xs px-2 py-1 rounded border transition-colors ${channelsOpen ? 'border-purple-300 text-purple-600 bg-purple-50' : 'border-gray-200 text-gray-400 hover:border-purple-300 hover:text-purple-600'}`}>
                ≡
              </button>
            )}
            <button onClick={() => onToggleStatus(ct)} title={ct.status === 'active' ? 'Pause' : 'Enable'}
              className={`text-xs px-2 py-1 rounded border transition-colors ${ct.status === 'active' ? 'border-gray-200 text-gray-400 hover:border-amber-300 hover:text-amber-600 hover:bg-amber-50' : 'border-emerald-300 text-emerald-600 bg-emerald-50 hover:bg-emerald-100'}`}>
              {ct.status === 'active' ? '⏸' : '▶'}
            </button>
            {!isDraft && (
              <button onClick={() => onRunOne(ct)} disabled={isRunning} title="Run one batch now"
                className={`text-xs px-2 py-1 rounded border transition-colors ${isRunning ? 'border-purple-200 text-purple-400 bg-purple-50 cursor-not-allowed' : 'border-gray-200 text-gray-400 hover:border-purple-300 hover:text-purple-600 hover:bg-purple-50'}`}>
                {isRunning ? '…' : '▷'}
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
            <button onClick={() => onOpenBrief(ct)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
          </div>
          <div className="p-4 space-y-3">
            <label className="block text-xs text-gray-400 mb-1">instruction to Emily — applies to every instance</label>
            <textarea value={briefText} onChange={e => setBriefText(e.target.value)} rows={6}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-800 resize-y focus:outline-none focus:border-purple-300" />
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
            <button onClick={() => onSaveBrief(ct.id)} disabled={savingBrief}
              className="text-xs px-4 py-1.5 rounded border border-purple-300 text-purple-700 hover:bg-purple-50 disabled:opacity-50">
              {savingBrief ? 'saving...' : 'save brief'}
            </button>
          </div>
        </div>
      )}

      {/* Channels breakdown (social posts only) */}
      {channelsOpen && isSocialPosts && (
        <div className="mt-1 rounded-lg border border-purple-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
            <span className="text-xs font-medium text-gray-700">Social posts — by channel</span>
            <button onClick={() => onOpenChannels(ct)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
          </div>
          {channelLoading ? (
            <div className="px-4 py-4 text-center text-xs text-gray-400">Loading channels...</div>
          ) : (
            <>
              <div className="grid px-4 py-2 text-xs text-gray-400 border-b border-gray-50" style={{ gridTemplateColumns: '80px 1fr 80px 80px 80px 80px' }}>
                <span>channel</span><span></span>
                <span className="text-center text-blue-500">to review</span>
                <span className="text-center text-emerald-500">approved</span>
                <span className="text-center text-gray-400">published</span>
                <span></span>
              </div>
              {channelStats.map(cs => (
                <div key={cs.platform} className="grid items-center px-4 py-2.5 border-b border-gray-50 last:border-0"
                  style={{ gridTemplateColumns: '80px 1fr 80px 80px 80px 80px' }}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">
                      {PLATFORM_ICONS[cs.platform] || cs.platform.slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div className="text-xs text-gray-600 capitalize">{cs.platform}</div>
                  <div className="text-center">
                    {cs.to_review > 0 ? (
                      <button onClick={() => onOpenReview(ct, cs.platform)}
                        className="text-sm font-medium text-blue-500 hover:text-blue-700 underline underline-offset-2">
                        {cs.to_review}
                      </button>
                    ) : <span className="text-sm text-gray-300">—</span>}
                  </div>
                  <div className="text-center">
                    <span className={`text-sm font-medium ${cs.approved > 0 ? 'text-emerald-600' : 'text-gray-300'}`}>
                      {cs.approved > 0 ? cs.approved : '—'}
                    </span>
                  </div>
                  <div className="text-center">
                    <span className={`text-sm ${cs.published > 0 ? 'text-gray-500' : 'text-gray-300'}`}>
                      {cs.published > 0 ? cs.published : '—'}
                    </span>
                  </div>
                  <div className="flex justify-end">
                    {cs.to_review > 0 && (
                      <button onClick={() => onOpenReview(ct, cs.platform)}
                        className="text-xs px-2 py-0.5 rounded border border-blue-200 text-blue-600 hover:bg-blue-50">
                        review
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {channelStats.length === 0 && (
                <div className="px-4 py-4 text-center text-xs text-gray-400">No active channel data yet.</div>
              )}
            </>
          )}
        </div>
      )}

      {/* Review queue */}
      {reviewOpen && (
        <div className="mt-1 rounded-lg border border-blue-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
            <span className="text-xs font-medium text-gray-700">
              {ct.name}{reviewPlatform ? ` · ${reviewPlatform}` : ''} —{' '}
              {queueLoading ? 'loading...' : queueItems.length === 0 ? 'queue empty' : `${queueItems.length} to review`}
            </span>
            <button onClick={() => onOpenReview(ct)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
          </div>
          {queueLoading ? (
            <div className="px-4 py-6 text-center text-xs text-gray-400">Loading...</div>
          ) : queueItems.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-gray-400">
              Nothing waiting for review right now.
            </div>
          ) : (
            <>
              {queueItems.map(item => (
                <div key={item.id} className="px-4 py-3 border-b border-gray-50 last:border-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-800 truncate">
                        {item.title || item.target_keyword || item.platform || item.id}
                      </div>
                      {(item.draft_content || item.draft_copy) && (
                        <div className="mt-1">
                          <div className={`text-xs text-gray-600 whitespace-pre-wrap leading-relaxed ${expandedItems.has(item.id) ? '' : 'line-clamp-2'}`}>
                            {item.draft_content || item.draft_copy}
                          </div>
                          <button
                            onClick={() => onToggleExpand(item.id)}
                            className="text-xs text-blue-500 hover:text-blue-700 mt-1"
                          >
                            {expandedItems.has(item.id) ? '▲ collapse' : '▼ read full article'}
                          </button>
                        </div>
                      )}
                      <div className="text-xs text-gray-400 mt-1">
                        {item.content_type && <span className="mr-2 capitalize">{item.content_type.replace('_', ' ')}</span>}
                        {item.platform && <span className="mr-2 capitalize">{item.platform}</span>}
                        {item.created_at && new Date(item.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => onReject(item, ct)}
                        className="text-xs px-3 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50">reject</button>
                      <button onClick={() => onApprove(item, ct)}
                        className="text-xs px-3 py-1 rounded border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100">approve</button>
                    </div>
                  </div>
                </div>
              ))}
              {queueItems.length > 1 && (
                <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 flex justify-end">
                  <button onClick={() => queueItems.forEach(item => onApprove(item, ct))}
                    className="text-xs px-4 py-1.5 rounded border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100">
                    approve all {queueItems.length}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
