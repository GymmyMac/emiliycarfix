import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Loader2, CheckCircle2, Clock, FileText, Send, X, Eye } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';

/* ─── types ─── */
interface SeoTask {
  id: string;
  task_id: string;
  tier: number;
  title: string;
  content_type: string;
  target_keyword: string;
  seo_difficulty: number | null;
  catalogue_status: string;
  status: string;
  priority_score: number;
  draft_content: string | null;
  draft_saved_at: string | null;
  james_approved: boolean;
  approved_at: string | null;
  published_at: string | null;
  notes: string | null;
  redirect_note: string | null;
  created_at: string;
  updated_at: string;
}

/* ─── config maps ─── */
const contentTypeConfig: Record<string, { label: string; classes: string }> = {
  decision_page: { label: 'Decision Page', classes: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  ai_article: { label: 'AI Article', classes: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
  regional_seo: { label: 'Regional SEO', classes: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  tiktok: { label: 'TikTok', classes: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  social: { label: 'Social Post', classes: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  reddit: { label: 'Reddit', classes: 'bg-red-500/15 text-red-400 border-red-500/30' },
};

const statusConfig: Record<string, { label: string; classes: string }> = {
  pending: { label: 'Pending', classes: 'bg-muted/30 text-muted-foreground border-border' },
  in_progress: { label: 'In Progress', classes: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  approved: { label: 'Approved', classes: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  published: { label: 'Published', classes: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
};

type StatusFilter = 'all' | 'pending' | 'ready' | 'approved' | 'published';
type TypeFilter = 'all' | 'decision_page' | 'ai_article' | 'regional_seo' | 'social_tiktok';
type SortMode = 'priority' | 'newest' | 'alpha';

function wordCount(text: string | null): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function isReady(t: SeoTask) {
  return t.status === 'in_progress' && !!t.draft_content;
}

export default function SeoQueue() {
  const [tasks, setTasks] = useState<SeoTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('priority');
  const [selectedTask, setSelectedTask] = useState<SeoTask | null>(null);
  const [revisionMode, setRevisionMode] = useState(false);
  const [revisionNote, setRevisionNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  /* ─── fetch ─── */
  const fetchTasks = useCallback(async () => {
    const { data, error } = await supabase
      .from('mkt_seo_queue')
      .select('*')
      .order('priority_score', { ascending: false });
    if (!error) setTasks(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  /* ─── realtime ─── */
  useEffect(() => {
    const channel = supabase
      .channel('seo-queue-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mkt_seo_queue' }, (payload) => {
        const updated = payload.new as SeoTask;
        if (payload.eventType === 'INSERT') {
          setTasks(prev => [updated, ...prev]);
        } else if (payload.eventType === 'UPDATE') {
          setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
          if (updated.status === 'in_progress' && updated.draft_content) {
            toast.info(`New draft ready: ${updated.task_id} — ${updated.title}`);
          }
          // Update selected task if it's open
          if (selectedTask?.id === updated.id) {
            setSelectedTask(updated);
          }
        } else if (payload.eventType === 'DELETE') {
          setTasks(prev => prev.filter(t => t.id !== (payload.old as any).id));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedTask?.id]);

  /* ─── actions ─── */
  const handleApprove = async (task: SeoTask) => {
    setActionLoading(true);
    const { error } = await supabase
      .from('mkt_seo_queue')
      .update({ james_approved: true, approved_at: new Date().toISOString(), status: 'approved' })
      .eq('id', task.id);
    setActionLoading(false);
    if (error) { toast.error('Failed to approve'); return; }
    toast.success('Draft approved — ready for publishing');
    setSelectedTask(null);
    fetchTasks();
  };

  const handleRevision = async (task: SeoTask) => {
    setActionLoading(true);
    const { error } = await supabase
      .from('mkt_seo_queue')
      .update({
        james_approved: false,
        status: 'pending',
        draft_content: null,
        draft_saved_at: null,
        notes: revisionNote || null,
      })
      .eq('id', task.id);
    setActionLoading(false);
    if (error) { toast.error('Failed to send back'); return; }
    toast.success('Sent back to queue');
    setRevisionMode(false);
    setRevisionNote('');
    setSelectedTask(null);
    fetchTasks();
  };

  /* ─── filtering & sorting ─── */
  let filtered = tasks;

  if (statusFilter === 'ready') filtered = filtered.filter(isReady);
  else if (statusFilter === 'pending') filtered = filtered.filter(t => t.status === 'pending');
  else if (statusFilter === 'approved') filtered = filtered.filter(t => t.status === 'approved');
  else if (statusFilter === 'published') filtered = filtered.filter(t => t.status === 'published');

  if (typeFilter === 'decision_page') filtered = filtered.filter(t => t.content_type === 'decision_page');
  else if (typeFilter === 'ai_article') filtered = filtered.filter(t => t.content_type === 'ai_article');
  else if (typeFilter === 'regional_seo') filtered = filtered.filter(t => t.content_type === 'regional_seo');
  else if (typeFilter === 'social_tiktok') filtered = filtered.filter(t => ['social', 'tiktok', 'reddit'].includes(t.content_type));

  if (sortMode === 'newest') filtered = [...filtered].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  else if (sortMode === 'alpha') filtered = [...filtered].sort((a, b) => a.title.localeCompare(b.title));
  // default is already priority desc from fetch

  /* ─── counts ─── */
  const totalCount = tasks.length;
  const pendingCount = tasks.filter(t => t.status === 'pending').length;
  const readyCount = tasks.filter(isReady).length;
  const approvedCount = tasks.filter(t => t.status === 'approved').length;
  const publishedCount = tasks.filter(t => t.status === 'published').length;

  /* ─── priority bar ─── */
  const PriorityBar = ({ score }: { score: number }) => {
    const color = score >= 70 ? 'bg-red-500' : score >= 40 ? 'bg-amber-500' : 'bg-muted-foreground/40';
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono w-6 text-right">{score}</span>
        <div className="h-1.5 w-16 rounded-full bg-accent overflow-hidden">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
        </div>
      </div>
    );
  };

  /* ─── difficulty badge ─── */
  const DifficultyBadge = ({ val }: { val: number | null }) => {
    if (val == null) return <span className="text-muted-foreground text-xs">—</span>;
    const color = val < 20 ? 'text-emerald-400' : val <= 50 ? 'text-amber-400' : 'text-red-400';
    return <span className={`text-xs font-mono font-semibold ${color}`}>{val}</span>;
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const statusTabs: { key: StatusFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: totalCount },
    { key: 'pending', label: 'Pending', count: pendingCount },
    { key: 'ready', label: 'Ready to Review', count: readyCount },
    { key: 'approved', label: 'Approved', count: approvedCount },
    { key: 'published', label: 'Published', count: publishedCount },
  ];

  const typeTabs: { key: TypeFilter; label: string }[] = [
    { key: 'all', label: 'All Types' },
    { key: 'decision_page', label: 'Decision Page' },
    { key: 'ai_article', label: 'AI Article' },
    { key: 'regional_seo', label: 'Regional SEO' },
    { key: 'social_tiktok', label: 'Social / TikTok' },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">SEO Content Queue</h1>
        <p className="mt-1 text-sm text-muted-foreground">Emily's long-form content pipeline — review and approve drafts</p>
      </div>

      {/* Stat badges */}
      <div className="flex flex-wrap gap-2">
        <StatBadge label="Total Tasks" count={totalCount} />
        <StatBadge label="Pending" count={pendingCount} />
        <StatBadge label="Ready to Review" count={readyCount} highlight={readyCount > 0} />
        <StatBadge label="Approved" count={approvedCount} />
        <StatBadge label="Published" count={publishedCount} />
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1">
          {statusTabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                statusFilter === tab.key
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as TypeFilter)}
            className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground"
          >
            {typeTabs.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <select
            value={sortMode}
            onChange={e => setSortMode(e.target.value as SortMode)}
            className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground"
          >
            <option value="priority">Priority</option>
            <option value="newest">Newest</option>
            <option value="alpha">A–Z</option>
          </select>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card py-16 text-center">
          <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            {totalCount === 0
              ? "Emily hasn't written any SEO content yet. Tasks will appear here as Emily completes them."
              : "No tasks match this filter"}
          </p>
          {totalCount > 0 && (
            <button onClick={() => { setStatusFilter('all'); setTypeFilter('all'); }} className="mt-2 text-xs text-primary hover:underline">
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-accent/40 text-left">
                <th className="px-3 py-3 font-medium text-muted-foreground">Task</th>
                <th className="px-3 py-3 font-medium text-muted-foreground">Title</th>
                <th className="hidden px-3 py-3 font-medium text-muted-foreground md:table-cell">Type</th>
                <th className="hidden px-3 py-3 font-medium text-muted-foreground lg:table-cell">Keyword</th>
                <th className="hidden px-3 py-3 font-medium text-muted-foreground sm:table-cell">Priority</th>
                <th className="hidden px-3 py-3 font-medium text-muted-foreground md:table-cell">Diff</th>
                <th className="px-3 py-3 font-medium text-muted-foreground">Status</th>
                <th className="hidden px-3 py-3 font-medium text-muted-foreground sm:table-cell">Draft</th>
                <th className="px-3 py-3 font-medium text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(task => {
                const ct = contentTypeConfig[task.content_type] ?? { label: task.content_type, classes: 'bg-muted/30 text-muted-foreground border-border' };
                const st = statusConfig[task.status] ?? statusConfig.pending;
                const ready = isReady(task);
                const isPublished = task.status === 'published';

                return (
                  <tr
                    key={task.id}
                    onClick={() => setSelectedTask(task)}
                    className={`cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-accent/60 ${isPublished ? 'opacity-50' : ''}`}
                  >
                    <td className="px-3 py-3">
                      <span className="font-mono text-xs font-semibold text-foreground bg-accent rounded px-1.5 py-0.5">{task.task_id}</span>
                    </td>
                    <td className="px-3 py-3 max-w-[240px]">
                      <span className="font-medium text-foreground line-clamp-1">{task.title}</span>
                    </td>
                    <td className="hidden px-3 py-3 md:table-cell">
                      <Badge variant="outline" className={ct.classes}>{ct.label}</Badge>
                    </td>
                    <td className="hidden px-3 py-3 lg:table-cell">
                      <span className="text-xs text-muted-foreground">{task.target_keyword}</span>
                    </td>
                    <td className="hidden px-3 py-3 sm:table-cell">
                      <PriorityBar score={task.priority_score} />
                    </td>
                    <td className="hidden px-3 py-3 md:table-cell">
                      <DifficultyBadge val={task.seo_difficulty} />
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant="outline" className={st.classes}>{st.label}</Badge>
                    </td>
                    <td className="hidden px-3 py-3 sm:table-cell">
                      {task.draft_saved_at ? (
                        <span className="text-xs text-emerald-400">
                          Draft ready<br />
                          <span className="text-muted-foreground">{formatDistanceToNow(new Date(task.draft_saved_at), { addSuffix: true })}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Not written</span>
                      )}
                    </td>
                    <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                      {ready && (
                        <Button size="sm" onClick={() => setSelectedTask(task)} className="bg-amber-500 hover:bg-amber-600 text-white text-xs h-7 gap-1">
                          <Eye size={14} /> Review
                        </Button>
                      )}
                      {task.status === 'approved' && (
                        <span className="text-xs text-blue-400 flex items-center gap-1"><CheckCircle2 size={14} /> Approved</span>
                      )}
                      {task.status === 'published' && (
                        <span className="text-xs text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 size={14} /> Published
                          {task.published_at && <br />}
                          {task.published_at && <span className="text-muted-foreground">{format(new Date(task.published_at), 'd MMM')}</span>}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Draft review sheet */}
      <Sheet open={!!selectedTask} onOpenChange={open => { if (!open) { setSelectedTask(null); setRevisionMode(false); setRevisionNote(''); } }}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
          {selectedTask && (
            <div className="flex flex-col h-full">
              {/* Header */}
              <SheetHeader className="p-5 border-b border-border space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-semibold bg-accent rounded px-2 py-0.5">{selectedTask.task_id}</span>
                  <Badge variant="outline" className={contentTypeConfig[selectedTask.content_type]?.classes ?? ''}>
                    {contentTypeConfig[selectedTask.content_type]?.label ?? selectedTask.content_type}
                  </Badge>
                  <Badge variant="outline" className={statusConfig[selectedTask.status]?.classes ?? ''}>
                    {statusConfig[selectedTask.status]?.label ?? selectedTask.status}
                  </Badge>
                </div>
                <SheetTitle className="text-lg font-bold text-foreground leading-tight">{selectedTask.title}</SheetTitle>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>Keyword: <span className="text-foreground">{selectedTask.target_keyword}</span></span>
                  <span>Priority: <span className="text-foreground">{selectedTask.priority_score}</span></span>
                  <span>Difficulty: <DifficultyBadge val={selectedTask.seo_difficulty} /></span>
                  {selectedTask.draft_saved_at && (
                    <span>Draft saved: <span className="text-foreground">{formatDistanceToNow(new Date(selectedTask.draft_saved_at), { addSuffix: true })}</span></span>
                  )}
                </div>
              </SheetHeader>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-5">
                {selectedTask.draft_content ? (
                  <div className="relative">
                    <span className="absolute top-2 right-2 text-[10px] text-muted-foreground font-mono bg-accent rounded px-1.5 py-0.5">
                      {wordCount(selectedTask.draft_content)} words
                    </span>
                    <div className="rounded-lg bg-accent/50 p-4 prose prose-sm prose-invert max-w-none
                      prose-headings:text-foreground prose-headings:font-bold
                      prose-p:text-foreground/90 prose-li:text-foreground/90
                      prose-strong:text-foreground prose-a:text-primary">
                      <ReactMarkdown>{selectedTask.draft_content}</ReactMarkdown>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Clock className="h-8 w-8 text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">Emily hasn't written this draft yet.</p>
                  </div>
                )}

                {selectedTask.notes && (
                  <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-400">
                    <strong>Notes:</strong> {selectedTask.notes}
                  </div>
                )}

                {/* Revision input */}
                {revisionMode && (
                  <div className="mt-4 space-y-2">
                    <Textarea
                      placeholder="Note for Emily (optional)..."
                      value={revisionNote}
                      onChange={e => setRevisionNote(e.target.value)}
                      className="text-sm"
                      rows={3}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleRevision(selectedTask)}
                        disabled={actionLoading}
                        className="bg-amber-500 hover:bg-amber-600 text-white gap-1"
                      >
                        {actionLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send size={14} />}
                        Send Back
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setRevisionMode(false); setRevisionNote(''); }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Action bar */}
              {selectedTask.draft_content && selectedTask.status === 'in_progress' && !revisionMode && (
                <div className="border-t border-border p-4 flex gap-2">
                  <Button
                    onClick={() => handleApprove(selectedTask)}
                    disabled={actionLoading}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 flex-1"
                  >
                    {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 size={16} />}
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setRevisionMode(true)}
                    className="border-amber-500/40 text-amber-400 hover:bg-amber-500/10 gap-1"
                  >
                    Request Revision
                  </Button>
                  <Button variant="ghost" onClick={() => setSelectedTask(null)}>
                    <X size={16} />
                  </Button>
                </div>
              )}

              {/* Close only bar for non-reviewable items */}
              {(!selectedTask.draft_content || selectedTask.status !== 'in_progress' || revisionMode) && !revisionMode && (
                <div className="border-t border-border p-4 flex justify-end">
                  <Button variant="ghost" onClick={() => setSelectedTask(null)}>Close</Button>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/* ─── stat badge component ─── */
function StatBadge({ label, count, highlight }: { label: string; count: number; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 text-center min-w-[100px] ${
      highlight ? 'border-amber-500/50 bg-amber-500/10' : 'border-border bg-card'
    }`}>
      <div className={`text-lg font-bold ${highlight ? 'text-amber-400' : 'text-foreground'}`}>{count}</div>
      <div className="text-[10px] text-muted-foreground leading-tight">{label}</div>
    </div>
  );
}
