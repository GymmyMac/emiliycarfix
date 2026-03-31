import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
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
  Plus, Sparkles, LayoutGrid, CalendarDays,
  GripVertical, Send, ArrowLeft, ExternalLink,
} from 'lucide-react';

/* ────────────────────────── types ────────────────────────── */
interface SeoTask {
  id: string;
  task_id: string | null;
  title: string;
  content_type: string | null;
  target_keyword: string | null;
  category: string | null;
  priority_score: number | null;
  status: string;
  output_types: string[] | null;
  notes: string | null;
  revision_note: string | null;
  scheduled_for: string | null;
  target_publish_date: string | null;
  draft_content: string | null;
  james_approved: boolean | null;
  approved_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string | null;
  hero_image_url: string | null;
  slug: string | null;
  seo_difficulty: number | null;
}

interface JobOutput {
  id: string;
  job_id: string;
  output_type: string;
  content: string | null;
  image_url: string | null;
  status: string;
}

/* ────────────────────────── constants ────────────────────────── */
const KANBAN_COLUMNS = [
  { id: 'queued', label: 'QUEUED', borderColor: '#6b7280' },
  { id: 'briefed', label: 'BRIEFED', borderColor: '#3b82f6' },
  { id: 'in_draft', label: 'IN DRAFT', borderColor: '#8b5cf6' },
  { id: 'pending_review', label: 'PENDING REVIEW', borderColor: '#f59e0b' },
  { id: 'approved', label: 'APPROVED', borderColor: '#22c55e' },
  { id: 'scheduled', label: 'SCHEDULED', borderColor: '#14b8a6' },
  { id: 'published', label: 'PUBLISHED', borderColor: '#15803d' },
] as const;

type KanbanColumnId = typeof KANBAN_COLUMNS[number]['id'];

const OUTPUT_TYPE_CONFIG: Record<string, { icon: string; label: string; activeColor: string }> = {
  seo_article: { icon: '📄', label: 'SEO Article', activeColor: 'bg-blue-500/20 text-blue-600 border-blue-500/40' },
  fb_ig: { icon: '📱', label: 'Fb / IG', activeColor: 'bg-purple-500/20 text-purple-600 border-purple-500/40' },
  tiktok: { icon: '🎬', label: 'TikTok', activeColor: 'bg-red-500/20 text-red-600 border-red-500/40' },
  email: { icon: '📧', label: 'Email', activeColor: 'bg-orange-500/20 text-orange-600 border-orange-500/40' },
  sms: { icon: '💬', label: 'SMS', activeColor: 'bg-green-500/20 text-green-600 border-green-500/40' },
  image: { icon: '🖼️', label: 'Image', activeColor: 'bg-yellow-500/20 text-yellow-600 border-yellow-500/40' },
  x_post: { icon: '🐦', label: 'X Post', activeColor: 'bg-sky-500/20 text-sky-600 border-sky-500/40' },
  reddit: { icon: '📝', label: 'Reddit', activeColor: 'bg-orange-600/20 text-orange-700 border-orange-600/40' },
};

const OUTPUT_TYPE_KEYS = Object.keys(OUTPUT_TYPE_CONFIG);

const CONTENT_TYPE_LABELS: Record<string, string> = {
  decision_page: 'DECISION PAGE',
  seo_article: 'SEO ARTICLE',
  ai_article: 'AI ARTICLE',
  regional_seo: 'REGIONAL SEO',
  social_campaign: 'SOCIAL CAMPAIGN',
  product_guide: 'PRODUCT GUIDE',
};

const BRIEF_OUTPUT_DESCRIPTIONS: Record<string, string> = {
  seo_article: 'Long-form guide, 600–900 words, optimised for search and AI citation',
  fb_ig: 'Facebook post (100–150 words) + Instagram caption (50–80 words)',
  tiktok: '60–90 second spoken video script. One product, one result.',
  email: 'Subject line + preview text + campaign body. Mailchimp-ready.',
  sms: 'Under 160 characters. Urgency or offer driven.',
  image: 'Ideogram prompt for a matched visual — square for social, landscape for article.',
  x_post: 'Under 280 characters. Deal alert or quick tip.',
  reddit: '200–400 word DIY thread. Community-first.',
};

function toSlug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
}

function wordCount(text: string | null) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function getPriorityStyle(score: number | null) {
  if (!score) return { bar: 'bg-gray-400', badge: 'bg-muted/15 text-muted-foreground' };
  if (score >= 80) return { bar: 'bg-red-500', badge: 'bg-red-500/15 text-red-600' };
  if (score >= 50) return { bar: 'bg-amber-500', badge: 'bg-amber-500/15 text-amber-600' };
  return { bar: 'bg-gray-400', badge: 'bg-muted/15 text-muted-foreground' };
}

/* ────────────────────── Droppable Column ────────────────────── */
function KanbanDropColumn({ id, label, borderColor, count, children }: {
  id: string; label: string; borderColor: string; count: number; children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col min-w-[240px] w-[240px] rounded-lg bg-[#ffffff] shadow-sm border border-border/50 transition-colors',
        isOver && 'ring-2 ring-primary/40 bg-accent/40'
      )}
      style={{ borderTopWidth: 4, borderTopColor: borderColor }}
    >
      <div className="flex items-center justify-between px-3 py-2.5">
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#6b7280' }}>{label}</span>
        <span
          className="text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center text-white"
          style={{ backgroundColor: borderColor }}
        >{count}</span>
      </div>
      <div className="flex-1 px-2 pb-2 space-y-2 overflow-y-auto max-h-[60vh] min-h-[80px]">
        {children}
      </div>
    </div>
  );
}

/* ────────────────────── Draggable Card ────────────────────── */
function KanbanCard({ task, column, onOpen, onToggleOutput }: {
  task: SeoTask; column: KanbanColumnId;
  onOpen: (t: SeoTask) => void;
  onToggleOutput: (taskId: string, outputType: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { task, column },
    disabled: column === 'published',
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const isPendingReview = column === 'pending_review';
  const pStyle = getPriorityStyle(task.priority_score);
  const outputs = task.output_types || [];

  const actionButton = () => {
    switch (column) {
      case 'queued': return <><Pencil size={10} className="mr-1" />Edit Brief</>;
      case 'briefed': return <><Eye size={10} className="mr-1" />View Draft</>;
      case 'in_draft': return <><Eye size={10} className="mr-1" />View Draft</>;
      case 'pending_review': return <><CheckCircle2 size={10} className="mr-1" />Review →</>;
      case 'approved': return <><CalendarIcon size={10} className="mr-1" />Schedule</>;
      case 'scheduled': return null;
      case 'published': return <><ExternalLink size={10} className="mr-1" />View Live →</>;
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded-lg border bg-white p-3 shadow-sm cursor-grab active:cursor-grabbing transition-all',
        isPendingReview && 'border-amber-500/60 bg-[#fffbeb]',
        isDragging && 'opacity-50 shadow-lg scale-105',
        !isPendingReview && 'border-border/60'
      )}
    >
      {/* Header: drag handle + priority bar + priority badge */}
      <div className="flex items-start gap-1.5">
        <div {...attributes} {...listeners} className="mt-0.5 text-muted-foreground/40 hover:text-muted-foreground cursor-grab">
          <GripVertical size={12} />
        </div>
        <div className={cn('w-1 h-8 rounded-full shrink-0', isPendingReview ? 'bg-amber-500' : pStyle.bar)} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-snug line-clamp-2" style={{ color: '#111827' }}>
            {task.title}
          </p>
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-primary/10 text-primary">
              {CONTENT_TYPE_LABELS[task.content_type || ''] || task.content_type || '—'}
            </span>
          </div>
        </div>
        {task.priority_score != null && (
          <span className={cn('text-[10px] font-bold rounded px-1.5 py-0.5 shrink-0', pStyle.badge)}>
            P{task.priority_score}
          </span>
        )}
      </div>

      {/* Output type pills */}
      <div className="flex flex-wrap gap-1 mt-2">
        {OUTPUT_TYPE_KEYS.map((key) => {
          const cfg = OUTPUT_TYPE_CONFIG[key];
          const active = outputs.includes(key);
          return (
            <button
              key={key}
              onClick={(e) => { e.stopPropagation(); onToggleOutput(task.id, key); }}
              className={cn(
                'text-[10px] font-semibold rounded-full px-1.5 py-0.5 border transition-all',
                active ? cfg.activeColor : 'bg-muted/5 text-muted-foreground/40 border-border/30'
              )}
            >
              {cfg.icon}
            </button>
          );
        })}
      </div>

      {/* Footer: date + action */}
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs" style={{ color: '#6b7280' }}>
          {task.target_publish_date ? format(new Date(task.target_publish_date), 'd MMM') :
           task.scheduled_for ? format(new Date(task.scheduled_for), 'd MMM HH:mm') : ''}
        </span>
        {column === 'scheduled' ? (
          <span className="text-xs font-medium" style={{ color: '#14b8a6' }}>
            {task.scheduled_for ? format(new Date(task.scheduled_for), 'd MMM HH:mm') : 'Scheduled'}
          </span>
        ) : (
          <Button
            size="sm"
            variant={isPendingReview ? 'default' : 'ghost'}
            className={cn(
              'h-6 text-[11px] px-2',
              isPendingReview && 'bg-amber-500 hover:bg-amber-600 text-white'
            )}
            onClick={(e) => { e.stopPropagation(); onOpen(task); }}
          >
            {actionButton()}
          </Button>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────── MAIN COMPONENT ────────────────────────── */
export default function Dashboard() {
  const [tasks, setTasks] = useState<SeoTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'pipeline' | 'calendar'>('pipeline');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filterPendingOnly, setFilterPendingOnly] = useState(false);

  // Review state
  const [reviewTask, setReviewTask] = useState<SeoTask | null>(null);
  const [reviewOutputs, setReviewOutputs] = useState<JobOutput[]>([]);
  const [reviewTab, setReviewTab] = useState<string>('');
  const [revisionMode, setRevisionMode] = useState(false);
  const [revisionNote, setRevisionNote] = useState('');
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>();
  const [scheduleTime, setScheduleTime] = useState('09:00');

  // Brief Emily
  const [briefOpen, setBriefOpen] = useState(false);
  const [briefTopic, setBriefTopic] = useState('');
  const [briefCategory, setBriefCategory] = useState('');
  const [briefType, setBriefType] = useState('decision_page');
  const [briefOutputs, setBriefOutputs] = useState<string[]>(['seo_article']);
  const [briefPriority, setBriefPriority] = useState<number>(60);
  const [briefDate, setBriefDate] = useState<Date | undefined>();
  const [briefNotes, setBriefNotes] = useState('');
  const [briefing, setBriefing] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  // Flash animation for realtime updates
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const fetchData = useCallback(async () => {
    const { data } = await supabase.from('mkt_seo_queue').select('*').order('priority_score', { ascending: false });
    if (data) setTasks(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Realtime — mkt_seo_queue
  useEffect(() => {
    const channel = supabase
      .channel('dashboard-seo')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mkt_seo_queue' }, (payload) => {
        const newRow = payload.new as SeoTask;
        if (payload.eventType === 'INSERT') {
          setTasks(prev => [newRow, ...prev]);
          flashCard(newRow.id);
        } else if (payload.eventType === 'UPDATE') {
          setTasks(prev => prev.map(t => t.id === newRow.id ? newRow : t));
          flashCard(newRow.id);
        } else if (payload.eventType === 'DELETE') {
          const oldRow = payload.old as SeoTask;
          setTasks(prev => prev.filter(t => t.id !== oldRow.id));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  function flashCard(id: string) {
    setFlashIds(prev => new Set(prev).add(id));
    setTimeout(() => setFlashIds(prev => { const s = new Set(prev); s.delete(id); return s; }), 2000);
  }

  /* ── computed ── */
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const metrics = useMemo(() => ({
    pendingReview: tasks.filter(t => t.status === 'pending_review').length,
    approved: tasks.filter(t => t.status === 'approved').length,
    scheduled: tasks.filter(t => t.status === 'scheduled').length,
    publishedMonth: tasks.filter(t => t.status === 'published' && t.published_at && t.published_at >= monthStart).length,
  }), [tasks, monthStart]);

  const kanbanData = useMemo(() => {
    const cols: Record<KanbanColumnId, SeoTask[]> = {
      queued: [], briefed: [], in_draft: [], pending_review: [],
      approved: [], scheduled: [], published: [],
    };
    tasks.forEach(t => {
      const col = t.status as KanbanColumnId;
      if (cols[col]) cols[col].push(t);
      else cols.queued.push(t); // fallback
    });
    if (filterPendingOnly) {
      // Show only pending_review, clear others
      Object.keys(cols).forEach(k => {
        if (k !== 'pending_review') cols[k as KanbanColumnId] = [];
      });
    }
    return cols;
  }, [tasks, filterPendingOnly]);

  /* ── 14-day calendar ── */
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
        items: tasks.filter(t => {
          const dateStr = t.scheduled_for?.split('T')[0] || t.target_publish_date;
          return dateStr === ds;
        }),
      });
    }
    return days;
  }, [tasks]);

  /* ── output type toggle (writes to DB) ── */
  const toggleOutput = useCallback(async (taskId: string, outputType: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const current = task.output_types || [];
    const next = current.includes(outputType) ? current.filter(o => o !== outputType) : [...current, outputType];
    // Optimistic
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, output_types: next } : t));
    await supabase.from('mkt_seo_queue').update({ output_types: next }).eq('id', taskId);
  }, [tasks]);

  /* ── drag & drop ── */
  const handleDragStart = (event: DragStartEvent) => setActiveId(event.active.id as string);

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const targetColumn = over.id as KanbanColumnId;
    const draggedTask = tasks.find(t => t.id === active.id);
    if (!draggedTask) return;
    if (draggedTask.status === targetColumn) return;

    // Prevent published from moving back
    if (draggedTask.status === 'published') {
      toast({ title: "Published content can't be moved back", variant: 'destructive' });
      return;
    }

    // Optimistic
    setTasks(prev => prev.map(t =>
      t.id === draggedTask.id ? { ...t, status: targetColumn } as SeoTask : t
    ));

    const updates: Record<string, any> = { status: targetColumn };
    if (targetColumn === 'approved') { updates.james_approved = true; updates.approved_at = new Date().toISOString(); }
    if (targetColumn === 'published') { updates.published_at = new Date().toISOString(); updates.james_approved = true; }

    const { error } = await supabase.from('mkt_seo_queue').update(updates).eq('id', draggedTask.id);
    if (error) {
      toast({ title: 'Failed to move card', description: error.message, variant: 'destructive' });
      fetchData();
    } else {
      toast({ title: `Moved to ${targetColumn.replace('_', ' ')}` });
    }
  };

  /* ── Review actions ── */
  const openReview = async (task: SeoTask) => {
    setReviewTask(task);
    setRevisionMode(false);
    setRevisionNote('');
    setScheduleMode(false);
    setScheduleDate(undefined);
    // Fetch outputs
    const { data } = await supabase.from('mkt_job_outputs').select('*').eq('job_id', task.id);
    const outputs = data || [];
    setReviewOutputs(outputs);
    setReviewTab(outputs.length > 0 ? outputs[0].output_type : 'draft');
  };

  const handlePublishNow = async () => {
    if (!reviewTask) return;
    await supabase.from('mkt_seo_queue').update({
      status: 'published', published_at: new Date().toISOString(), james_approved: true,
    }).eq('id', reviewTask.id);
    if (reviewOutputs.length > 0) {
      await supabase.from('mkt_job_outputs').update({ status: 'approved' }).eq('job_id', reviewTask.id);
    }
    toast({ title: 'Published ✓' });
    setReviewTask(null);
    fetchData();
  };

  const handleSchedule = async () => {
    if (!reviewTask || !scheduleDate) return;
    const dt = new Date(scheduleDate);
    const [h, m] = scheduleTime.split(':').map(Number);
    dt.setHours(h, m, 0, 0);
    await supabase.from('mkt_seo_queue').update({
      status: 'scheduled', scheduled_for: dt.toISOString(), james_approved: true,
    }).eq('id', reviewTask.id);
    toast({ title: `Scheduled for ${format(dt, 'd MMM yyyy HH:mm')} ✓` });
    setReviewTask(null);
    setScheduleMode(false);
    fetchData();
  };

  const handleRevision = async () => {
    if (!reviewTask) return;
    await supabase.from('mkt_seo_queue').update({
      status: 'in_draft', revision_note: revisionNote || null,
    }).eq('id', reviewTask.id);
    toast({ title: 'Sent back to Emily' });
    setReviewTask(null);
    setRevisionMode(false);
    setRevisionNote('');
    fetchData();
  };

  /* ── Brief Emily submit ── */
  const handleBriefSubmit = async () => {
    if (!briefTopic.trim()) return;
    setBriefing(true);
    const { error } = await supabase.from('mkt_seo_queue').insert({
      status: 'queued',
      content_type: briefType,
      title: briefTopic.trim(),
      category: briefCategory || null,
      target_publish_date: briefDate ? briefDate.toISOString().split('T')[0] : null,
      james_approved: false,
      priority_score: briefPriority,
      slug: toSlug(briefTopic),
      notes: briefNotes || null,
      output_types: briefOutputs,
    });
    setBriefing(false);
    if (!error) {
      toast({ title: 'Added to Queue →', description: "Emily will pick it up." });
      setBriefTopic(''); setBriefCategory(''); setBriefType('decision_page');
      setBriefOutputs(['seo_article']); setBriefPriority(60);
      setBriefDate(undefined); setBriefNotes(''); setBriefOpen(false);
    }
  };

  const toggleBriefOutput = (key: string) => {
    setBriefOutputs(prev => {
      let next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
      // Smart default: FB/IG → auto-add image
      if (key === 'fb_ig' && next.includes('fb_ig') && !next.includes('image')) {
        next = [...next, 'image'];
        toast({ title: 'Image Brief added', description: 'Instagram posts need an image — added automatically' });
      }
      return next;
    });
  };

  const activeDragTask = activeId ? tasks.find(t => t.id === activeId) : null;

  /* ── FULL-SCREEN REVIEW ── */
  if (reviewTask) {
    const currentOutput = reviewOutputs.find(o => o.output_type === reviewTab);
    const hasMultiple = reviewOutputs.length > 1;

    return (
      <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: '#f9fafb' }}>
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ backgroundColor: '#1a1a2e' }}>
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => setReviewTask(null)} className="text-white/70 hover:text-white">
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-white text-sm font-semibold truncate">{reviewTask.title}</h1>
          </div>
          {!revisionMode && (
            <button
              onClick={() => setRevisionMode(true)}
              className="text-white/50 hover:text-white text-xs shrink-0"
            >
              Request Revision
            </button>
          )}
        </div>

        {/* Revision inline */}
        {revisionMode && (
          <div className="px-4 py-3 border-b border-border bg-amber-50 flex items-center gap-3">
            <Textarea
              placeholder="What needs changing?"
              value={revisionNote}
              onChange={(e) => setRevisionNote(e.target.value)}
              className="flex-1 min-h-[40px] text-sm"
            />
            <Button size="sm" onClick={handleRevision} className="shrink-0 bg-amber-500 hover:bg-amber-600 text-white">
              Send to Emily →
            </Button>
            <button onClick={() => setRevisionMode(false)} className="text-muted-foreground text-xs">Cancel</button>
          </div>
        )}

        {/* Tabs if multiple outputs */}
        {hasMultiple && (
          <div className="flex gap-1 px-4 pt-3 border-b border-border bg-white overflow-x-auto">
            {reviewOutputs.map(o => (
              <button
                key={o.output_type}
                onClick={() => setReviewTab(o.output_type)}
                className={cn(
                  'px-3 py-2 text-xs font-semibold rounded-t-lg transition-colors whitespace-nowrap',
                  reviewTab === o.output_type
                    ? 'bg-accent text-foreground border-b-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {OUTPUT_TYPE_CONFIG[o.output_type]?.icon} {OUTPUT_TYPE_CONFIG[o.output_type]?.label || o.output_type}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="max-w-[720px] mx-auto">
            {currentOutput ? (
              <div className="space-y-4">
                {currentOutput.image_url && (
                  <img src={currentOutput.image_url} alt="" className="w-full rounded-lg object-cover max-h-[300px]" />
                )}
                {currentOutput.content && (
                  <div className="prose prose-sm max-w-none" style={{ color: '#111827' }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{currentOutput.content}</ReactMarkdown>
                  </div>
                )}
              </div>
            ) : reviewTask.draft_content ? (
              <div className="relative">
                <span className="absolute top-2 right-2 text-[10px] font-mono text-muted-foreground bg-white/80 px-2 py-0.5 rounded">
                  {wordCount(reviewTask.draft_content)} words
                </span>
                <div className="prose prose-sm max-w-none" style={{ color: '#111827' }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{reviewTask.draft_content}</ReactMarkdown>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
                Emily hasn't written a draft yet
              </div>
            )}
          </div>
        </div>

        {/* Bottom action bar */}
        <div className="border-t border-border bg-white px-4 py-3 shrink-0">
          {scheduleMode ? (
            <div className="max-w-[720px] mx-auto space-y-3">
              <div className="flex gap-3 items-end flex-wrap">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Date</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="h-9 text-sm">
                        <CalendarIcon size={14} className="mr-2" />
                        {scheduleDate ? format(scheduleDate, 'd MMM yyyy') : 'Pick date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={scheduleDate} onSelect={setScheduleDate} className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Time</label>
                  <Input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} className="h-9 w-32" />
                </div>
                <Button onClick={handleSchedule} disabled={!scheduleDate} className="h-9" style={{ backgroundColor: '#2563eb' }}>
                  Schedule for {scheduleDate ? format(scheduleDate, 'd MMM') : '...'} →
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setScheduleMode(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="max-w-[720px] mx-auto flex gap-3">
              <Button onClick={handlePublishNow} className="flex-1 h-11 font-semibold" style={{ backgroundColor: '#22c55e' }}>
                ✓ Publish Now
              </Button>
              <Button onClick={() => setScheduleMode(true)} className="flex-1 h-11 font-semibold" style={{ backgroundColor: '#2563eb' }}>
                📅 Schedule
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  const METRIC_CARDS = [
    { label: 'Pending My Review', value: metrics.pendingReview, icon: AlertCircle, color: '#f59e0b' },
    { label: 'Approved', value: metrics.approved, icon: CheckCircle2, color: '#22c55e' },
    { label: 'Scheduled', value: metrics.scheduled, icon: CalendarDays, color: '#14b8a6' },
    { label: 'Published This Month', value: metrics.publishedMonth, icon: FileText, color: '#15803d' },
  ];

  return (
    <div className="w-full space-y-4 min-w-0">
      {/* ── NEEDS MY ACTION STRIP ── */}
      <button
        onClick={() => setFilterPendingOnly(!filterPendingOnly)}
        className="w-full rounded-lg px-4 py-3 flex items-center gap-3 transition-colors"
        style={{ backgroundColor: '#1a1a2e' }}
      >
        {metrics.pendingReview > 0 ? (
          <>
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
            <span className="text-white text-sm font-medium">
              Needs My Action — <strong>{metrics.pendingReview}</strong> {metrics.pendingReview === 1 ? 'item' : 'items'} waiting for your review
            </span>
          </>
        ) : (
          <>
            <CheckCircle2 size={16} className="text-green-400 shrink-0" />
            <span className="text-white text-sm font-medium">You're all clear — no content needs your attention right now</span>
          </>
        )}
      </button>

      {/* ── METRIC TILES ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {METRIC_CARDS.map((m) => (
          <div key={m.label} className="rounded-lg bg-white border border-border/50 shadow-sm p-3 flex items-center gap-3">
            <m.icon size={18} style={{ color: m.color }} className="shrink-0" />
            <div>
              <p className="text-xl font-bold" style={{ color: '#111827' }}>{m.value}</p>
              <p className="text-xs" style={{ color: '#6b7280' }}>{m.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── VIEW TOGGLE + BRIEF EMILY ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
          <button
            onClick={() => { setViewMode('pipeline'); setFilterPendingOnly(false); }}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
              viewMode === 'pipeline' ? 'text-white' : 'text-muted-foreground hover:text-foreground'
            )}
            style={viewMode === 'pipeline' ? { backgroundColor: '#2563eb' } : {}}
          >
            <LayoutGrid size={14} /> Pipeline
          </button>
          <button
            onClick={() => setViewMode('calendar')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
              viewMode === 'calendar' ? 'text-white' : 'text-muted-foreground hover:text-foreground'
            )}
            style={viewMode === 'calendar' ? { backgroundColor: '#2563eb' } : {}}
          >
            <CalendarDays size={14} /> Calendar
          </button>
        </div>
        <Button onClick={() => setBriefOpen(true)} className="h-9 text-sm font-semibold gap-1.5" style={{ backgroundColor: '#2563eb' }}>
          <Plus size={14} /> Brief Emily
        </Button>
      </div>

      {/* ── MAIN CONTENT ── */}
      {viewMode === 'pipeline' ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-3 pb-2 overflow-x-auto" style={{ minWidth: 0 }}>
            {KANBAN_COLUMNS.map((col) => (
              <KanbanDropColumn
                key={col.id}
                id={col.id}
                label={col.label}
                borderColor={col.borderColor}
                count={kanbanData[col.id].length}
              >
                {kanbanData[col.id].map(task => (
                  <KanbanCard
                    key={task.id}
                    task={task}
                    column={col.id}
                    onOpen={openReview}
                    onToggleOutput={toggleOutput}
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
              <div className="rounded-lg border border-primary bg-white p-3 shadow-xl w-[240px] opacity-90">
                <p className="text-sm font-semibold truncate" style={{ color: '#111827' }}>{activeDragTask.title}</p>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      ) : (
        /* ── CALENDAR VIEW ── */
        <div className="rounded-lg border border-border bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-sm font-bold" style={{ color: '#111827' }}>14-Day Content Calendar</h3>
          </div>
          <div className="p-3 overflow-x-auto">
            <div className="grid gap-1 min-w-[900px]" style={{ gridTemplateColumns: 'repeat(14, 1fr)' }}>
              {calendarDays.map((day) => (
                <div
                  key={day.label}
                  className="rounded-lg p-2 min-h-[100px] border border-border/30"
                  style={{ backgroundColor: day.items.length > 0 ? '#ffffff' : '#f9fafb' }}
                >
                  <p className="text-[9px] font-bold uppercase" style={{ color: '#6b7280' }}>{day.dayLabel}</p>
                  <p className="text-[11px] font-semibold mb-1" style={{ color: '#111827' }}>{day.label}</p>
                  <div className="space-y-1">
                    {day.items.map((item) => {
                      const outputs = item.output_types || [];
                      return (
                        <button
                          key={item.id}
                          onClick={() => openReview(item)}
                          className="w-full text-left rounded px-1.5 py-1 bg-primary/5 hover:bg-primary/10 transition-colors"
                        >
                          <p className="text-[10px] font-medium truncate" style={{ color: '#111827' }}>{item.title}</p>
                          <div className="flex gap-0.5 mt-0.5">
                            {outputs.map(o => {
                              const cfg = OUTPUT_TYPE_CONFIG[o];
                              return cfg ? (
                                <span key={o} className="text-[8px]">{cfg.icon}</span>
                              ) : null;
                            })}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════ BRIEF EMILY SHEET ═══════════════════ */}
      <Sheet open={briefOpen} onOpenChange={setBriefOpen}>
        <SheetContent className="w-full sm:w-[480px] sm:max-w-[480px] overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="text-lg font-bold text-foreground text-left flex items-center gap-2">
              Brief Emily
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-5">
            {/* Topic */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Topic / Working Title *</label>
              <Input
                placeholder="e.g. How to choose the right brake pads for a Toyota Hilux"
                value={briefTopic}
                onChange={(e) => setBriefTopic(e.target.value)}
              />
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Category *</label>
              <Select value={briefCategory} onValueChange={setBriefCategory}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {['Braking', 'Suspension', 'Engine', 'Drivetrain', 'Cooling', 'Electrical', 'Oil & Filtration', 'Regional', 'Other'].map(c =>
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Content Type */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Content Type *</label>
              <Select value={briefType} onValueChange={setBriefType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="decision_page">Decision Page</SelectItem>
                  <SelectItem value="ai_article">AI Article</SelectItem>
                  <SelectItem value="regional_seo">Regional SEO Page</SelectItem>
                  <SelectItem value="social_campaign">Social Campaign</SelectItem>
                  <SelectItem value="product_guide">Product Guide</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Output Types */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Output Types * (select at least one)</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {OUTPUT_TYPE_KEYS.map(key => {
                  const cfg = OUTPUT_TYPE_CONFIG[key];
                  const active = briefOutputs.includes(key);
                  return (
                    <button
                      key={key}
                      onClick={() => toggleBriefOutput(key)}
                      className={cn(
                        'text-left rounded-lg border p-2.5 transition-all',
                        active ? cfg.activeColor + ' border-current' : 'border-border bg-muted/5 text-muted-foreground'
                      )}
                    >
                      <span className="text-sm font-semibold">{cfg.icon} {cfg.label}</span>
                      <p className="text-[10px] mt-0.5 leading-tight opacity-70">{BRIEF_OUTPUT_DESCRIPTIONS[key]}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Priority */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Priority *</label>
              <div className="flex gap-2">
                {[
                  { label: '🔴 High', value: 90 },
                  { label: '🟡 Medium', value: 60 },
                  { label: '⚪ Low', value: 30 },
                ].map(p => (
                  <button
                    key={p.value}
                    onClick={() => setBriefPriority(p.value)}
                    className={cn(
                      'text-sm font-semibold rounded-lg px-4 py-2 border transition-all flex-1',
                      briefPriority === p.value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Target Date */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Target Publish Date (optional)</label>
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
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes for Emily (optional)</label>
              <Textarea
                placeholder="Any specific angles, NZ references, competitor hooks, or requirements Emily should know about"
                value={briefNotes}
                onChange={(e) => setBriefNotes(e.target.value)}
                rows={4}
              />
            </div>

            <Button
              onClick={handleBriefSubmit}
              disabled={!briefTopic.trim() || briefOutputs.length === 0 || briefing}
              className="w-full h-11 font-semibold text-sm"
              style={{ backgroundColor: '#2563eb' }}
            >
              Add to Queue →
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
