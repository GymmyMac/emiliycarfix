import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  DndContext, closestCorners, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors, useDroppable,
} from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  FileText, CheckCircle2, Clock, AlertCircle,
  ChevronDown, ChevronUp, Eye, Pencil, X, CalendarIcon,
  Plus, Sparkles, Download, ExternalLink, LayoutGrid, CalendarDays,
  GripVertical, Play, Send,
} from 'lucide-react';

/* ────────────────────────── types ────────────────────────── */
interface SeoTask {
  id: string;
  task_id: string | null;
  tier: number | null;
  title: string;
  content_type: string | null;
  target_keyword: string | null;
  seo_difficulty: number | null;
  catalogue_status: string | null;
  status: string;
  priority_score: number | null;
  draft_content: string | null;
  draft_saved_at: string | null;
  james_approved: boolean | null;
  approved_at: string | null;
  published_at: string | null;
  published_url: string | null;
  notes: string | null;
  redirect_note: string | null;
  created_at: string;
  updated_at: string | null;
  target_publish_date: string | null;
  category: string | null;
  hero_image_url: string | null;
  page_views_day7: number | null;
  rego_widget_lookups: number | null;
  email_open_rate: number | null;
  slug: string | null;
}

/* ────────────────────────── constants ────────────────────────── */
const TYPE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  decision_page: { bg: 'bg-blue-500/15', text: 'text-blue-400', label: 'Decision Page' },
  seo_article: { bg: 'bg-green-500/15', text: 'text-green-400', label: 'SEO Article' },
  ai_article: { bg: 'bg-purple-500/15', text: 'text-purple-400', label: 'AI Article' },
  aeo_content: { bg: 'bg-blue-400/15', text: 'text-blue-300', label: 'AEO' },
  regional_seo: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', label: 'Regional SEO' },
  tiktok: { bg: 'bg-orange-500/15', text: 'text-orange-400', label: 'TikTok' },
  social: { bg: 'bg-orange-500/15', text: 'text-orange-400', label: 'Social' },
  social_post: { bg: 'bg-orange-500/15', text: 'text-orange-400', label: 'Social Post' },
  email: { bg: 'bg-purple-500/15', text: 'text-purple-400', label: 'Email' },
  email_draft: { bg: 'bg-purple-500/15', text: 'text-purple-400', label: 'Email' },
  sms: { bg: 'bg-pink-500/15', text: 'text-pink-400', label: 'SMS' },
  video_script: { bg: 'bg-teal-500/15', text: 'text-teal-400', label: 'Video Script' },
  reddit: { bg: 'bg-red-500/15', text: 'text-red-400', label: 'Reddit' },
};

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-muted/20', text: 'text-muted-foreground', label: 'Pending' },
  briefed: { bg: 'bg-blue-500/15', text: 'text-blue-400', label: 'Briefed' },
  draft: { bg: 'bg-amber-500/15', text: 'text-amber-400', label: 'Draft' },
  in_progress: { bg: 'bg-amber-500/15', text: 'text-amber-400', label: 'In Progress' },
  needs_revision: { bg: 'bg-red-500/15', text: 'text-red-400', label: 'Needs Revision' },
  approved: { bg: 'bg-blue-500/15', text: 'text-blue-400', label: 'Approved' },
  published: { bg: 'bg-green-500/15', text: 'text-green-400', label: 'Published' },
};

const KANBAN_COLUMNS = [
  { id: 'queued', label: 'Queued', color: 'border-t-muted-foreground' },
  { id: 'briefed', label: 'Briefed', color: 'border-t-blue-500' },
  { id: 'in_draft', label: 'In Draft', color: 'border-t-amber-500' },
  { id: 'pending_review', label: 'Pending Review', color: 'border-t-yellow-500' },
  { id: 'approved', label: 'Approved', color: 'border-t-emerald-500' },
  { id: 'scheduled', label: 'Scheduled', color: 'border-t-purple-500' },
  { id: 'published', label: 'Published', color: 'border-t-green-500' },
] as const;

type KanbanColumnId = typeof KANBAN_COLUMNS[number]['id'];

const CHANNEL_COLORS: Record<string, string> = {
  seo_article: '#22c55e',
  decision_page: '#22c55e',
  ai_article: '#22c55e',
  regional_seo: '#22c55e',
  aeo_content: '#3b82f6',
  social_post: '#f97316',
  social: '#f97316',
  email_draft: '#a855f7',
  email: '#a855f7',
  sms: '#ec4899',
  video_script: '#14b8a6',
  tiktok: '#f97316',
};

// Calendar channel grouping colors
const CALENDAR_CHANNEL_COLORS = {
  'SEO/Blog': '#22c55e',
  'Social': '#f97316',
  'Email': '#a855f7',
};

function toSlug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
}

function wordCount(text: string | null) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function TypeBadge({ type }: { type: string | null }) {
  const c = TYPE_COLORS[type || ''] || { bg: 'bg-muted/20', text: 'text-muted-foreground', label: type || '—' };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${c.bg} ${c.text}`}>{c.label}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.pending;
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${c.bg} ${c.text}`}>{c.label}</span>;
}

function getKanbanColumn(task: SeoTask): KanbanColumnId {
  if (task.status === 'published') return 'published';
  if (task.james_approved && task.target_publish_date) return 'scheduled';
  if (task.james_approved || task.status === 'approved') return 'approved';
  if ((task.status === 'draft' || task.status === 'in_progress') && task.draft_content && !task.james_approved) return 'pending_review';
  if ((task.status === 'in_progress' || task.status === 'draft') && task.draft_content) return 'in_draft';
  if (task.status === 'briefed') return 'briefed';
  if (task.status === 'needs_revision') return 'in_draft';
  return 'queued';
}

function getPriorityColor(score: number | null) {
  if (!score) return 'bg-gray-500';
  if (score >= 70) return 'bg-red-500';
  if (score >= 40) return 'bg-amber-500';
  return 'bg-gray-400';
}

/* ────────────────────── Droppable Column ────────────────────── */
function KanbanDropColumn({ id, label, color, count, children }: {
  id: string; label: string; color: string; count: number; children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col min-w-[240px] w-[240px] rounded-xl border border-border bg-card/50 border-t-4 transition-colors',
        color,
        isOver && 'ring-2 ring-primary/40 bg-accent/40'
      )}
    >
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/50">
        <span className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="text-xs font-bold bg-muted/20 text-muted-foreground rounded-full w-6 h-6 flex items-center justify-center">{count}</span>
      </div>
      <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[55vh] min-h-[100px]">
        {children}
      </div>
    </div>
  );
}

/* ────────────────────── Draggable Card ────────────────────── */
function KanbanCard({ task, column, onOpen, channelScopes, onToggleChannel }: {
  task: SeoTask; column: KanbanColumnId;
  onOpen: (t: SeoTask) => void;
  channelScopes: Record<string, string[]>;
  onToggleChannel: (taskId: string, channel: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { task, column },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const isPendingReview = column === 'pending_review';
  const channels = channelScopes[task.id] || [];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded-lg border bg-card p-2.5 shadow-sm cursor-grab active:cursor-grabbing transition-all',
        isPendingReview && 'border-amber-500/60 ring-1 ring-amber-500/20',
        isDragging && 'opacity-50 shadow-lg scale-105',
        !isPendingReview && 'border-border/60'
      )}
    >
      {/* Drag handle + priority bar */}
      <div className="flex items-start gap-1.5">
        <div {...attributes} {...listeners} className="mt-0.5 text-muted-foreground/40 hover:text-muted-foreground cursor-grab">
          <GripVertical size={12} />
        </div>
        <div className={cn('w-1 h-8 rounded-full shrink-0', getPriorityColor(task.priority_score))} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground leading-tight truncate" title={task.title}>
            {task.title.length > 55 ? task.title.slice(0, 55) + '…' : task.title}
          </p>
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            <TypeBadge type={task.content_type} />
            {task.priority_score != null && (
              <span className="text-[9px] font-bold text-muted-foreground bg-muted/15 rounded px-1">P{task.priority_score}</span>
            )}
          </div>
        </div>
      </div>

      {/* Channel scope toggles */}
      <div className="flex gap-1 mt-2">
        {(['SEO/Blog', 'Social', 'Email'] as const).map((ch) => (
          <button
            key={ch}
            onClick={(e) => { e.stopPropagation(); onToggleChannel(task.id, ch); }}
            className={cn(
              'text-[9px] font-bold rounded-full px-2 py-0.5 transition-all border',
              channels.includes(ch)
                ? ch === 'SEO/Blog' ? 'bg-green-500/20 text-green-400 border-green-500/40'
                : ch === 'Social' ? 'bg-orange-500/20 text-orange-400 border-orange-500/40'
                : 'bg-purple-500/20 text-purple-400 border-purple-500/40'
                : 'bg-muted/5 text-muted-foreground/50 border-border/30'
            )}
          >
            {ch}
          </button>
        ))}
      </div>

      {/* Target date + action */}
      <div className="flex items-center justify-between mt-2">
        <span className="text-[10px] text-muted-foreground">
          {task.target_publish_date ? format(new Date(task.target_publish_date), 'd MMM') : ''}
        </span>
        <Button
          size="sm"
          variant={isPendingReview ? 'default' : 'ghost'}
          className={cn(
            'h-6 text-[10px] px-2',
            isPendingReview && 'bg-amber-500 hover:bg-amber-600 text-white'
          )}
          onClick={(e) => { e.stopPropagation(); onOpen(task); }}
        >
          {column === 'queued' && <><Send size={10} className="mr-1" />Brief</>}
          {(column === 'briefed' || column === 'in_draft') && <><Eye size={10} className="mr-1" />View</>}
          {column === 'pending_review' && <><CheckCircle2 size={10} className="mr-1" />Review</>}
          {column === 'approved' && <><CalendarIcon size={10} className="mr-1" />Schedule</>}
          {column === 'scheduled' && <><Eye size={10} className="mr-1" />View</>}
          {column === 'published' && <><ExternalLink size={10} className="mr-1" />View</>}
        </Button>
      </div>
    </div>
  );
}

/* ────────────────────────── MAIN COMPONENT ────────────────────────── */
export default function Dashboard() {
  const [tasks, setTasks] = useState<SeoTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageTab, setPageTab] = useState<'queue' | 'ledger'>('queue');
  const [viewMode, setViewMode] = useState<'pipeline' | 'calendar'>('pipeline');
  const [selectedTask, setSelectedTask] = useState<SeoTask | null>(null);
  const [revisionMode, setRevisionMode] = useState(false);
  const [revisionNote, setRevisionNote] = useState('');
  const [pubDatePicker, setPubDatePicker] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [channelScopes, setChannelScopes] = useState<Record<string, string[]>>({});
  const [activeId, setActiveId] = useState<string | null>(null);

  // Brief Emily sheet
  const [briefOpen, setBriefOpen] = useState(false);
  const [briefTopic, setBriefTopic] = useState('');
  const [briefCategory, setBriefCategory] = useState('');
  const [briefType, setBriefType] = useState('seo_article');
  const [briefChannels, setBriefChannels] = useState<string[]>(['SEO/Blog']);
  const [briefPriority, setBriefPriority] = useState<number>(60);
  const [briefDate, setBriefDate] = useState<Date | undefined>();
  const [briefNotes, setBriefNotes] = useState('');
  const [briefing, setBriefing] = useState(false);

  // Emily suggestions collapsed
  const [suggestionsOpen, setSuggestionsOpen] = useState(true);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const fetchData = useCallback(async () => {
    const { data } = await supabase.from('mkt_seo_queue').select('*').order('priority_score', { ascending: false });
    if (data) {
      setTasks(data);
      const cats = [...new Set(data.map(t => t.category).filter(Boolean))] as string[];
      setCategories(cats);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('cmd-centre')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mkt_seo_queue' }, (payload) => {
        const newRow = payload.new as SeoTask;
        if (payload.eventType === 'INSERT') {
          setTasks(prev => [newRow, ...prev]);
        } else if (payload.eventType === 'UPDATE') {
          setTasks(prev => prev.map(t => t.id === newRow.id ? newRow : t));
          if (newRow.status === 'draft' || (newRow.status === 'in_progress' && newRow.draft_content)) {
            toast({ title: 'New content ready for review', description: `${newRow.task_id || ''} — ${newRow.title}` });
          }
        } else if (payload.eventType === 'DELETE') {
          const oldRow = payload.old as SeoTask;
          setTasks(prev => prev.filter(t => t.id !== oldRow.id));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  /* ── computed ── */
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const metrics = useMemo(() => {
    const pendingReview = tasks.filter(t =>
      (t.status === 'draft' || t.status === 'in_progress') && t.draft_content && !t.james_approved
    ).length;
    const approved = tasks.filter(t => t.james_approved && t.status !== 'published').length;
    const scheduled = tasks.filter(t => t.james_approved && t.target_publish_date && t.status !== 'published').length;
    const publishedMonth = tasks.filter(t => t.status === 'published' && t.published_at && t.published_at >= monthStart).length;
    return { pendingReview, approved, scheduled, publishedMonth };
  }, [tasks, monthStart]);

  // Needs my action items
  const actionItems = useMemo(() =>
    tasks.filter(t => (t.status === 'draft' || t.status === 'in_progress') && t.draft_content && !t.james_approved)
      .sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0)),
    [tasks]
  );

  // Kanban columns
  const kanbanData = useMemo(() => {
    const cols: Record<KanbanColumnId, SeoTask[]> = {
      queued: [], briefed: [], in_draft: [], pending_review: [],
      approved: [], scheduled: [], published: [],
    };
    tasks.forEach(t => {
      const col = getKanbanColumn(t);
      cols[col].push(t);
    });
    return cols;
  }, [tasks]);

  const publishedTasks = useMemo(() => tasks.filter(t => t.status === 'published'), [tasks]);

  /* ── 14-day calendar data ── */
  const calendarDays = useMemo(() => {
    const days: { date: Date; label: string; dayLabel: string; items: SeoTask[] }[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      const ds = d.toISOString().split('T')[0];
      days.push({
        date: d,
        label: format(d, 'd MMM'),
        dayLabel: format(d, 'EEE'),
        items: tasks.filter(t => t.target_publish_date?.startsWith(ds)),
      });
    }
    return days;
  }, [tasks]);

  /* ── AI suggestions ── */
  const suggestions = useMemo(() => {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000).toISOString();
    const results: { title: string; category: string | null; reason: string; content_type: string }[] = [];

    const catCounts: Record<string, SeoTask[]> = {};
    tasks.filter(t => t.status === 'pending' && t.category).forEach(t => {
      (catCounts[t.category!] ||= []).push(t);
    });
    let gapCat: string | null = null;
    let gapMax = 0;
    for (const [cat, items] of Object.entries(catCounts)) {
      const recentDrafts = tasks.filter(t => t.category === cat && t.draft_content && t.updated_at && t.updated_at > sevenDaysAgo).length;
      if (recentDrafts === 0 && items.length > gapMax) { gapMax = items.length; gapCat = cat; }
    }
    if (gapCat && catCounts[gapCat].length > 0) {
      const best = catCounts[gapCat].sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0))[0];
      results.push({ title: best.title, category: best.category, reason: `No ${gapCat} content drafted this week`, content_type: best.content_type || 'seo_article' });
    }

    const untouched = tasks.filter(t => t.status === 'pending' && !t.draft_content).sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0));
    if (untouched.length > 0) {
      results.push({ title: untouched[0].title, category: untouched[0].category, reason: `High priority (${untouched[0].priority_score}), not yet started`, content_type: untouched[0].content_type || 'seo_article' });
    }

    const typeCounts: Record<string, number> = {};
    tasks.filter(t => t.updated_at && t.updated_at > fourteenDaysAgo).forEach(t => {
      if (t.content_type) typeCounts[t.content_type] = (typeCounts[t.content_type] || 0) + 1;
    });
    const allTypes = ['seo_article', 'social_post', 'email_draft', 'video_script', 'aeo_content'];
    const leastType = allTypes.sort((a, b) => (typeCounts[a] || 0) - (typeCounts[b] || 0))[0];
    results.push({ title: `New ${TYPE_COLORS[leastType]?.label || leastType} content`, category: null, reason: `Fewest ${TYPE_COLORS[leastType]?.label || leastType} updates in 14 days`, content_type: leastType });

    return results.slice(0, 3);
  }, [tasks]);

  /* ── channel scope toggle ── */
  const toggleChannel = useCallback((taskId: string, channel: string) => {
    setChannelScopes(prev => {
      const current = prev[taskId] || [];
      const next = current.includes(channel) ? current.filter(c => c !== channel) : [...current, channel];
      return { ...prev, [taskId]: next };
    });
  }, []);

  /* ── drag & drop ── */
  const columnStatusMap: Record<KanbanColumnId, Partial<SeoTask>> = {
    queued: { status: 'pending', james_approved: false },
    briefed: { status: 'briefed' },
    in_draft: { status: 'in_progress' },
    pending_review: { status: 'draft', james_approved: false },
    approved: { status: 'approved', james_approved: true, approved_at: new Date().toISOString() },
    scheduled: { status: 'approved', james_approved: true },
    published: { status: 'published', published_at: new Date().toISOString() },
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const targetColumn = over.id as KanbanColumnId;
    const draggedTask = tasks.find(t => t.id === active.id);
    if (!draggedTask) return;

    const currentCol = getKanbanColumn(draggedTask);
    if (currentCol === targetColumn) return;

    const updates = columnStatusMap[targetColumn];
    if (!updates) return;

    // Optimistic update
    setTasks(prev => prev.map(t =>
      t.id === draggedTask.id ? { ...t, ...updates } as SeoTask : t
    ));

    const { error } = await supabase
      .from('mkt_seo_queue')
      .update(updates)
      .eq('id', draggedTask.id);

    if (error) {
      toast({ title: 'Failed to move card', description: error.message, variant: 'destructive' });
      fetchData();
    }
  };

  /* ── actions ── */
  const handleApprove = async (task: SeoTask) => {
    await supabase.from('mkt_seo_queue').update({ james_approved: true, approved_at: new Date().toISOString(), status: 'approved' }).eq('id', task.id);
    toast({ title: 'Draft approved', description: 'Ready for publishing' });
    setSelectedTask(null);
  };

  const handleRevision = async (task: SeoTask) => {
    await supabase.from('mkt_seo_queue').update({ status: 'needs_revision', notes: revisionNote || null }).eq('id', task.id);
    toast({ title: 'Sent back to queue', description: 'Emily will revise' });
    setRevisionNote('');
    setRevisionMode(false);
    setSelectedTask(null);
  };

  const handleSetPubDate = async (task: SeoTask, date: Date) => {
    await supabase.from('mkt_seo_queue').update({ target_publish_date: date.toISOString().split('T')[0] }).eq('id', task.id);
    toast({ title: 'Publish date set', description: format(date, 'dd MMM yyyy') });
    setPubDatePicker(false);
  };

  const handleBriefSubmit = async () => {
    if (!briefTopic.trim()) return;
    setBriefing(true);
    const { error } = await supabase.from('mkt_seo_queue').insert({
      status: 'briefed',
      content_type: briefType,
      title: briefTopic.trim(),
      category: briefCategory || null,
      target_publish_date: briefDate ? briefDate.toISOString().split('T')[0] : null,
      james_approved: false,
      priority_score: briefPriority,
      slug: toSlug(briefTopic),
      notes: briefNotes || null,
    });
    setBriefing(false);
    if (!error) {
      toast({ title: 'Topic added to queue', description: "Emily will pick it up in the next cycle." });
      setBriefTopic('');
      setBriefCategory('');
      setBriefType('seo_article');
      setBriefChannels(['SEO/Blog']);
      setBriefPriority(60);
      setBriefDate(undefined);
      setBriefNotes('');
      setBriefOpen(false);
    }
  };

  const handleAddSuggestion = async (s: { title: string; category: string | null; content_type: string }) => {
    await supabase.from('mkt_seo_queue').insert({
      status: 'briefed',
      content_type: s.content_type,
      title: s.title,
      category: s.category,
      james_approved: false,
      priority_score: 75,
      slug: toSlug(s.title),
    });
    toast({ title: 'Added to queue', description: s.title });
  };

  const exportCsv = () => {
    const headers = ['Title', 'Published Date', 'URL', 'Page Views (7d)', 'Rego Lookups', 'Email Open Rate'];
    const rows = publishedTasks.map(t => [
      `"${(t.title || '').replace(/"/g, '""')}"`,
      t.published_at ? format(new Date(t.published_at), 'dd MMM yyyy') : '',
      t.published_url || '',
      t.page_views_day7 ?? '',
      t.rego_widget_lookups ?? '',
      t.email_open_rate != null ? `${(t.email_open_rate * 100).toFixed(1)}%` : '',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `content-ledger-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const activeDragTask = activeId ? tasks.find(t => t.id === activeId) : null;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  const METRIC_CARDS = [
    { label: 'Pending My Review', value: metrics.pendingReview, icon: AlertCircle, border: 'border-l-amber-500', color: 'text-amber-500' },
    { label: 'Approved', value: metrics.approved, icon: CheckCircle2, border: 'border-l-emerald-500', color: 'text-emerald-500' },
    { label: 'Scheduled', value: metrics.scheduled, icon: CalendarDays, border: 'border-l-purple-500', color: 'text-purple-500' },
    { label: 'Published This Month', value: metrics.publishedMonth, icon: FileText, border: 'border-l-green-500', color: 'text-green-500' },
  ];

  return (
    <div className="w-full max-w-full space-y-4 overflow-x-hidden">
      {/* ── HEADER ── */}
      <div className="rounded-xl bg-foreground/95 px-5 py-4 text-card">
        <h1 className="font-display text-xl font-bold tracking-tight">Content Command Centre</h1>
        <p className="text-sm opacity-70">Emily's content pipeline — review, approve, schedule</p>
      </div>

      {/* ── PAGE TABS ── */}
      <Tabs value={pageTab} onValueChange={(v) => setPageTab(v as 'queue' | 'ledger')}>
        <TabsList className="w-full max-w-xs">
          <TabsTrigger value="queue" className="flex-1">Queue</TabsTrigger>
          <TabsTrigger value="ledger" className="flex-1">Ledger</TabsTrigger>
        </TabsList>

        {/* ═══════════════════ QUEUE TAB ═══════════════════ */}
        <TabsContent value="queue" className="space-y-4 mt-4">
          {/* METRICS BAR — 4 cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {METRIC_CARDS.map((s) => (
              <Card key={s.label} className={`rounded-xl border-l-4 ${s.border} shadow-sm`}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <s.icon size={16} className={cn('shrink-0', s.color)} />
                    <span className="text-2xl font-bold text-foreground">{s.value}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* NEEDS MY ACTION STRIP */}
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <h2 className="text-sm font-bold text-foreground">Needs My Action</h2>
              {actionItems.length > 0 && (
                <span className="text-[10px] font-bold bg-amber-500/20 text-amber-500 rounded-full px-2 py-0.5">{actionItems.length}</span>
              )}
            </div>
            {actionItems.length === 0 ? (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <CheckCircle2 size={14} className="text-green-500" />
                You're all clear — no content needs your attention right now
              </p>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {actionItems.map(task => (
                  <button
                    key={task.id}
                    onClick={() => setSelectedTask(task)}
                    className="shrink-0 rounded-lg border border-amber-500/30 bg-card p-2.5 text-left hover:bg-accent/50 transition-colors min-w-[200px] max-w-[240px]"
                  >
                    <p className="text-xs font-semibold text-foreground truncate">{task.title}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <TypeBadge type={task.content_type} />
                      {task.priority_score != null && (
                        <span className={cn(
                          'text-[9px] font-bold rounded px-1 py-0.5',
                          task.priority_score >= 70 ? 'bg-red-500/15 text-red-400' :
                          task.priority_score >= 40 ? 'bg-amber-500/15 text-amber-400' :
                          'bg-muted/15 text-muted-foreground'
                        )}>
                          P{task.priority_score}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* VIEW TOGGLE + BRIEF EMILY BUTTON */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
              <button
                onClick={() => setViewMode('pipeline')}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                  viewMode === 'pipeline' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <LayoutGrid size={14} /> Pipeline
              </button>
              <button
                onClick={() => setViewMode('calendar')}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                  viewMode === 'calendar' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <CalendarDays size={14} /> Calendar
              </button>
            </div>
            <Button onClick={() => setBriefOpen(true)} className="h-9 text-sm font-semibold gap-1.5">
              <Plus size={14} /> Brief Emily
            </Button>
          </div>

          {/* MAIN CONTENT AREA */}
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Pipeline / Calendar */}
            <div className="flex-1 min-w-0">
              {viewMode === 'pipeline' ? (
                /* ── KANBAN BOARD ── */
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCorners}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                >
                  <div className="flex gap-3 overflow-x-auto pb-2 lg:grid lg:grid-cols-7 lg:overflow-x-visible">
                    {KANBAN_COLUMNS.map((col) => (
                      <KanbanDropColumn
                        key={col.id}
                        id={col.id}
                        label={col.label}
                        color={col.color}
                        count={kanbanData[col.id].length}
                      >
                        {kanbanData[col.id].map(task => (
                          <KanbanCard
                            key={task.id}
                            task={task}
                            column={col.id}
                            onOpen={setSelectedTask}
                            channelScopes={channelScopes}
                            onToggleChannel={toggleChannel}
                          />
                        ))}
                        {kanbanData[col.id].length === 0 && (
                          <div className="flex items-center justify-center h-16 text-[10px] text-muted-foreground/40">
                            Empty
                          </div>
                        )}
                      </KanbanDropColumn>
                    ))}
                  </div>
                  <DragOverlay>
                    {activeDragTask && (
                      <div className="rounded-lg border border-primary bg-card p-2.5 shadow-xl w-[220px] opacity-90">
                        <p className="text-xs font-semibold text-foreground truncate">{activeDragTask.title}</p>
                        <TypeBadge type={activeDragTask.content_type} />
                      </div>
                    )}
                  </DragOverlay>
                </DndContext>
              ) : (
                /* ── CALENDAR VIEW ── */
                <div className="rounded-xl border border-border bg-card/50 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-border">
                    <h3 className="text-sm font-bold text-foreground">14-Day Content Calendar</h3>
                    <div className="flex gap-3 mt-1">
                      {Object.entries(CALENDAR_CHANNEL_COLORS).map(([ch, color]) => (
                        <span key={ch} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                          {ch}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="p-4 overflow-x-auto">
                    <div className="grid gap-1 min-w-[700px]" style={{ gridTemplateColumns: 'repeat(14, 1fr)' }}>
                      {calendarDays.map((day) => (
                        <div
                          key={day.label}
                          className={cn(
                            'rounded-lg p-2 min-h-[80px] text-center border border-border/30',
                            day.items.length === 0 ? 'bg-muted/5' : 'bg-card'
                          )}
                        >
                          <p className="text-[9px] font-bold text-muted-foreground uppercase">{day.dayLabel}</p>
                          <p className="text-[11px] font-semibold text-foreground mb-1">{day.label}</p>
                          <div className="flex flex-col items-center gap-1">
                            {day.items.map((item) => {
                              // Determine channel color
                              const ct = item.content_type || '';
                              const channelColor =
                                ['social_post', 'social', 'tiktok'].includes(ct) ? CALENDAR_CHANNEL_COLORS.Social :
                                ['email_draft', 'email', 'sms'].includes(ct) ? CALENDAR_CHANNEL_COLORS.Email :
                                CALENDAR_CHANNEL_COLORS['SEO/Blog'];
                              return (
                                <Tooltip key={item.id}>
                                  <TooltipTrigger asChild>
                                    <button
                                      onClick={() => setSelectedTask(item)}
                                      className="w-3 h-3 rounded-full transition-transform hover:scale-150"
                                      style={{ backgroundColor: channelColor }}
                                    />
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-xs max-w-[200px]">
                                    <p className="font-semibold">{item.title}</p>
                                    <p className="text-muted-foreground">{TYPE_COLORS[ct]?.label || ct}</p>
                                  </TooltipContent>
                                </Tooltip>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* SIDEBAR — Emily Suggests (desktop only, reduced weight) */}
            <div className="hidden lg:block w-[280px] shrink-0">
              <div className="rounded-xl border border-border bg-card/30 shadow-sm overflow-hidden">
                <button
                  onClick={() => setSuggestionsOpen(!suggestionsOpen)}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-bold text-muted-foreground uppercase tracking-wider hover:bg-accent/30 transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <Sparkles size={12} className="text-secondary" /> Emily Suggests
                  </span>
                  {suggestionsOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
                {suggestionsOpen && (
                  <div className="p-2.5 space-y-2 border-t border-border/30">
                    {suggestions.map((s, i) => (
                      <div key={i} className="rounded-lg border border-border/30 p-2.5 space-y-1 bg-accent/10">
                        <p className="text-xs font-medium text-foreground leading-tight">{s.title}</p>
                        <div className="flex items-center gap-1">
                          {s.category && <span className="text-[9px] rounded-full bg-primary/10 text-primary px-1.5 py-0.5 font-semibold">{s.category}</span>}
                          <TypeBadge type={s.content_type} />
                        </div>
                        <p className="text-[10px] text-muted-foreground">{s.reason}</p>
                        <Button size="sm" variant="ghost" className="h-6 text-[10px] w-full" onClick={() => handleAddSuggestion(s)}>
                          <Plus size={10} className="mr-1" /> Add to Queue
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ═══════════════════ LEDGER TAB ═══════════════════ */}
        <TabsContent value="ledger" className="space-y-4 mt-4">
          <div className="grid grid-cols-3 gap-3">
            <Card className="rounded-xl border-l-4 border-l-green-500 shadow-sm">
              <CardContent className="p-3">
                <span className="text-2xl font-bold text-foreground">{publishedTasks.length}</span>
                <p className="text-xs text-muted-foreground">Published</p>
              </CardContent>
            </Card>
            <Card className="rounded-xl border-l-4 border-l-blue-500 shadow-sm">
              <CardContent className="p-3">
                <span className="text-2xl font-bold text-foreground">{publishedTasks.reduce((a, t) => a + (t.page_views_day7 || 0), 0)}</span>
                <p className="text-xs text-muted-foreground">Page Views</p>
              </CardContent>
            </Card>
            <Card className="rounded-xl border-l-4 border-l-amber-500 shadow-sm">
              <CardContent className="p-3">
                <span className="text-2xl font-bold text-foreground">{publishedTasks.reduce((a, t) => a + (t.rego_widget_lookups || 0), 0)}</span>
                <p className="text-xs text-muted-foreground">Rego Lookups</p>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={exportCsv} className="text-xs h-8">
              <Download size={14} className="mr-1.5" /> Export CSV
            </Button>
          </div>

          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/5">
                    <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Title</th>
                    <th className="text-left px-3 py-2 font-semibold text-muted-foreground hidden md:table-cell">Published</th>
                    <th className="text-left px-3 py-2 font-semibold text-muted-foreground hidden md:table-cell">URL</th>
                    <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Views 7d</th>
                    <th className="text-right px-3 py-2 font-semibold text-muted-foreground hidden lg:table-cell">Rego</th>
                    <th className="text-right px-3 py-2 font-semibold text-muted-foreground hidden lg:table-cell">Open Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {publishedTasks.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">No published content yet</td></tr>
                  ) : (
                    publishedTasks.map((t) => (
                      <tr key={t.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                        <td className="px-3 py-2.5 font-medium text-foreground truncate max-w-[250px]">{t.title}</td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground hidden md:table-cell">{t.published_at ? format(new Date(t.published_at), 'dd MMM yyyy') : '—'}</td>
                        <td className="px-3 py-2.5 hidden md:table-cell">
                          {t.published_url ? (
                            <a href={t.published_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                              <ExternalLink size={12} /> Link
                            </a>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right text-foreground">{t.page_views_day7 ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right text-foreground hidden lg:table-cell">{t.rego_widget_lookups ?? '—'}</td>
                        <td className="px-3 py-2.5 text-right text-foreground hidden lg:table-cell">{t.email_open_rate != null ? `${(t.email_open_rate * 100).toFixed(1)}%` : '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* ═══════════════════ BRIEF EMILY SHEET ═══════════════════ */}
      <Sheet open={briefOpen} onOpenChange={setBriefOpen}>
        <SheetContent className="w-full sm:w-[440px] sm:max-w-[440px] overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="text-lg font-bold text-foreground text-left flex items-center gap-2">
              <Send size={18} /> Brief Emily
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-4">
            {/* Topic */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Topic / Working Title *</label>
              <Input
                placeholder="e.g. How to replace brake pads on a Toyota Hilux"
                value={briefTopic}
                onChange={(e) => setBriefTopic(e.target.value)}
              />
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Category</label>
              <Select value={briefCategory} onValueChange={setBriefCategory}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {['Braking', 'Suspension', 'Engine', 'Drivetrain', 'Cooling', 'Electrical', 'Other',
                    ...categories.filter(c => !['Braking', 'Suspension', 'Engine', 'Drivetrain', 'Cooling', 'Electrical', 'Other'].includes(c))
                  ].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Content Type */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Content Type</label>
              <Select value={briefType} onValueChange={setBriefType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="seo_article">SEO Article</SelectItem>
                  <SelectItem value="decision_page">Decision Page</SelectItem>
                  <SelectItem value="regional_seo">Regional SEO</SelectItem>
                  <SelectItem value="email_draft">Email Newsletter</SelectItem>
                  <SelectItem value="social_post">Social Post</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Channel Scope */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Channel Scope</label>
              <div className="flex gap-2">
                {['SEO/Blog', 'Social', 'Email'].map(ch => (
                  <button
                    key={ch}
                    onClick={() => setBriefChannels(prev =>
                      prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch]
                    )}
                    className={cn(
                      'text-xs font-semibold rounded-full px-3 py-1.5 border transition-all',
                      briefChannels.includes(ch)
                        ? ch === 'SEO/Blog' ? 'bg-green-500/20 text-green-600 border-green-500/40'
                        : ch === 'Social' ? 'bg-orange-500/20 text-orange-600 border-orange-500/40'
                        : 'bg-purple-500/20 text-purple-600 border-purple-500/40'
                        : 'bg-muted/10 text-muted-foreground border-border'
                    )}
                  >
                    {ch}
                  </button>
                ))}
              </div>
            </div>

            {/* Priority */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Priority</label>
              <div className="flex gap-2">
                {[{ label: 'High', value: 90, color: 'bg-red-500/15 text-red-500 border-red-500/40' },
                  { label: 'Medium', value: 60, color: 'bg-amber-500/15 text-amber-500 border-amber-500/40' },
                  { label: 'Low', value: 30, color: 'bg-muted/15 text-muted-foreground border-border' }
                ].map(p => (
                  <button
                    key={p.value}
                    onClick={() => setBriefPriority(p.value)}
                    className={cn(
                      'text-xs font-semibold rounded-full px-3 py-1.5 border transition-all',
                      briefPriority === p.value ? p.color : 'bg-muted/5 text-muted-foreground/50 border-border/30'
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Target Date */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Target Publish Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon size={14} className="mr-2 shrink-0" />
                    {briefDate ? format(briefDate, 'dd MMM yyyy') : 'Optional'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={briefDate} onSelect={setBriefDate} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Additional Notes for Emily</label>
              <Textarea
                placeholder="Any specific angles, keywords, or requirements..."
                value={briefNotes}
                onChange={(e) => setBriefNotes(e.target.value)}
                className="min-h-[80px]"
              />
            </div>

            <Button
              onClick={handleBriefSubmit}
              disabled={!briefTopic.trim() || briefing}
              className="w-full h-11 font-semibold text-sm"
            >
              <Plus size={14} className="mr-1.5" /> Add to Queue
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* ═══════════════════ REVIEW DRAWER ═══════════════════ */}
      <Sheet open={!!selectedTask} onOpenChange={(open) => { if (!open) { setSelectedTask(null); setRevisionMode(false); setRevisionNote(''); setPubDatePicker(false); } }}>
        <SheetContent className="w-full sm:w-[50vw] sm:max-w-[700px] overflow-y-auto p-0">
          {selectedTask && (
            <div className="flex flex-col h-full">
              <SheetHeader className="p-5 border-b border-border space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedTask.task_id && (
                    <span className="font-mono text-xs bg-muted/20 text-muted-foreground px-2 py-0.5 rounded">{selectedTask.task_id}</span>
                  )}
                  <TypeBadge type={selectedTask.content_type} />
                  <StatusBadge status={selectedTask.status} />
                  {selectedTask.priority_score != null && (
                    <span className="text-xs font-bold text-foreground bg-muted/10 px-2 py-0.5 rounded">P{selectedTask.priority_score}</span>
                  )}
                </div>
                <SheetTitle className="text-lg font-bold text-foreground text-left">{selectedTask.title}</SheetTitle>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {selectedTask.category && <span>Category: <strong className="text-foreground">{selectedTask.category}</strong></span>}
                  {selectedTask.target_keyword && <span>Keyword: <strong className="text-foreground">{selectedTask.target_keyword}</strong></span>}
                  {selectedTask.seo_difficulty != null && (
                    <span>
                      Difficulty: <strong className={selectedTask.seo_difficulty < 20 ? 'text-green-500' : selectedTask.seo_difficulty <= 50 ? 'text-amber-500' : 'text-red-500'}>
                        {selectedTask.seo_difficulty}
                      </strong>
                    </span>
                  )}
                  {selectedTask.target_publish_date && <span>Target: <strong className="text-foreground">{format(new Date(selectedTask.target_publish_date), 'd MMM yyyy')}</strong></span>}
                  {selectedTask.draft_saved_at && <span>Draft saved: <strong className="text-foreground">{format(new Date(selectedTask.draft_saved_at), 'dd MMM, HH:mm')}</strong></span>}
                </div>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto p-5">
                {selectedTask.hero_image_url && (
                  <img src={selectedTask.hero_image_url} alt="" className="w-full rounded-lg mb-4 object-cover max-h-[200px]" />
                )}
                {selectedTask.draft_content ? (
                  <div className="relative">
                    <span className="absolute top-2 right-2 text-[10px] font-mono text-muted-foreground bg-card/80 px-2 py-0.5 rounded">
                      {wordCount(selectedTask.draft_content)} words
                    </span>
                    <div className="prose prose-sm max-w-none bg-accent/20 rounded-lg p-4 text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-a:text-primary">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedTask.draft_content}</ReactMarkdown>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
                    Emily hasn't written a draft yet
                  </div>
                )}

                {selectedTask.notes && (
                  <div className="mt-4 rounded-lg border border-border p-3 bg-muted/5">
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm text-foreground">{selectedTask.notes}</p>
                  </div>
                )}
              </div>

              <div className="border-t border-border p-4 space-y-3">
                {revisionMode ? (
                  <div className="space-y-2">
                    <Textarea
                      placeholder="Revision notes for Emily (optional)"
                      value={revisionNote}
                      onChange={(e) => setRevisionNote(e.target.value)}
                      className="min-h-[60px] text-sm"
                    />
                    <div className="flex gap-2">
                      <Button variant="destructive" className="flex-1 h-10 text-sm font-semibold" onClick={() => handleRevision(selectedTask)}>
                        Confirm Revision
                      </Button>
                      <Button variant="outline" className="flex-1 h-10 text-sm" onClick={() => setRevisionMode(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : pubDatePicker ? (
                  <div className="space-y-2">
                    <Calendar
                      mode="single"
                      selected={selectedTask.target_publish_date ? new Date(selectedTask.target_publish_date) : undefined}
                      onSelect={(d) => d && handleSetPubDate(selectedTask, d)}
                      className="p-3 pointer-events-auto mx-auto"
                    />
                    <Button variant="outline" className="w-full h-9 text-sm" onClick={() => setPubDatePicker(false)}>Cancel</Button>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button className="flex-1 h-11 font-semibold text-sm bg-green-600 hover:bg-green-700 text-white" onClick={() => handleApprove(selectedTask)}>
                      <CheckCircle2 size={16} className="mr-1.5" /> Approve
                    </Button>
                    <Button variant="outline" className="flex-1 h-11 font-semibold text-sm border-amber-500/50 text-amber-600 hover:bg-amber-50" onClick={() => setRevisionMode(true)}>
                      <Pencil size={16} className="mr-1.5" /> Request Revision
                    </Button>
                    <Button variant="outline" className="flex-1 h-11 font-semibold text-sm" onClick={() => setPubDatePicker(true)}>
                      <CalendarIcon size={16} className="mr-1.5" /> Set Publish Date
                    </Button>
                    <Button variant="ghost" className="h-11 text-sm" onClick={() => setSelectedTask(null)}>
                      <X size={16} className="mr-1.5" /> Close
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
