import { useEffect, useState, useCallback, useMemo } from 'react';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  FileText, CheckCircle2, Clock, AlertCircle, Database,
  ChevronDown, ChevronUp, Eye, Pencil, X, CalendarIcon,
  Plus, Sparkles, Download, ExternalLink,
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

const CALENDAR_DOT_COLORS: Record<string, string> = {
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

/* ────────────────────────── MAIN COMPONENT ────────────────────────── */
export default function Dashboard() {
  const [tasks, setTasks] = useState<SeoTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageTab, setPageTab] = useState<'queue' | 'ledger'>('queue');
  const [filterStatus, setFilterStatus] = useState('all');
  const [calendarOpen, setCalendarOpen] = useState(true);
  const [selectedTask, setSelectedTask] = useState<SeoTask | null>(null);
  const [revisionMode, setRevisionMode] = useState(false);
  const [revisionNote, setRevisionNote] = useState('');
  const [pubDatePicker, setPubDatePicker] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);

  // Brief Emily form
  const [briefTopic, setBriefTopic] = useState('');
  const [briefCategory, setBriefCategory] = useState('');
  const [briefType, setBriefType] = useState('seo_article');
  const [briefDate, setBriefDate] = useState<Date | undefined>();
  const [briefing, setBriefing] = useState(false);

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
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();

  const stats = useMemo(() => {
    const approved7 = tasks.filter(t => t.james_approved && t.approved_at && t.approved_at > sevenDaysAgo).length;
    const published7 = tasks.filter(t => t.status === 'published' && t.published_at && t.published_at > sevenDaysAgo).length;
    const inDraft7 = tasks.filter(t => ['draft', 'in_progress'].includes(t.status) && t.updated_at && t.updated_at > sevenDaysAgo).length;
    const pendingReview = tasks.filter(t => t.status === 'draft' && !t.james_approved).length;
    return { approved7, published7, inDraft7, pendingReview, total: tasks.length };
  }, [tasks, sevenDaysAgo]);

  const filteredTasks = useMemo(() => {
    if (filterStatus === 'all') return tasks;
    if (filterStatus === 'pending_review') return tasks.filter(t => t.status === 'draft' && !t.james_approved);
    if (filterStatus === 'approved') return tasks.filter(t => t.james_approved);
    if (filterStatus === 'published') return tasks.filter(t => t.status === 'published');
    if (filterStatus === 'needs_revision') return tasks.filter(t => t.status === 'needs_revision');
    if (filterStatus === 'briefed') return tasks.filter(t => t.status === 'briefed');
    return tasks;
  }, [tasks, filterStatus]);

  const publishedTasks = useMemo(() => tasks.filter(t => t.status === 'published'), [tasks]);

  /* ── 14-day calendar data ── */
  const calendarDays = useMemo(() => {
    const days: { date: Date; label: string; items: SeoTask[] }[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      const ds = d.toISOString().split('T')[0];
      days.push({
        date: d,
        label: format(d, 'd MMM'),
        items: tasks.filter(t => t.target_publish_date?.startsWith(ds)),
      });
    }
    return days;
  }, [tasks]);

  /* ── AI suggestions ── */
  const suggestions = useMemo(() => {
    const results: { title: string; category: string | null; reason: string; content_type: string }[] = [];

    // Suggestion 1: Category gap
    const catCounts: Record<string, SeoTask[]> = {};
    tasks.filter(t => t.status === 'pending' && t.category).forEach(t => {
      (catCounts[t.category!] ||= []).push(t);
    });
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000).toISOString();
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

    // Suggestion 2: High priority untouched
    const untouched = tasks.filter(t => t.status === 'pending' && !t.draft_content).sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0));
    if (untouched.length > 0 && (!results.length || untouched[0].id !== results[0]?.title)) {
      results.push({ title: untouched[0].title, category: untouched[0].category, reason: `High priority (${untouched[0].priority_score}), not yet started`, content_type: untouched[0].content_type || 'seo_article' });
    }

    // Suggestion 3: Content type gap
    const typeCounts: Record<string, number> = {};
    tasks.filter(t => t.updated_at && t.updated_at > fourteenDaysAgo).forEach(t => {
      if (t.content_type) typeCounts[t.content_type] = (typeCounts[t.content_type] || 0) + 1;
    });
    const allTypes = ['seo_article', 'social_post', 'email_draft', 'video_script', 'aeo_content'];
    const leastType = allTypes.sort((a, b) => (typeCounts[a] || 0) - (typeCounts[b] || 0))[0];
    results.push({ title: `New ${TYPE_COLORS[leastType]?.label || leastType} content`, category: null, reason: `Fewest ${TYPE_COLORS[leastType]?.label || leastType} updates in 14 days`, content_type: leastType });

    return results.slice(0, 3);
  }, [tasks]);

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
      priority_score: 75,
      slug: toSlug(briefTopic),
    });
    setBriefing(false);
    if (!error) {
      toast({ title: 'Topic added to queue', description: "Emily will pick it up in the next cycle." });
      setBriefTopic('');
      setBriefCategory('');
      setBriefType('seo_article');
      setBriefDate(undefined);
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

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  const STAT_CARDS = [
    { label: 'Articles Approved', value: stats.approved7, icon: CheckCircle2, border: 'border-l-blue-500' },
    { label: 'Published', value: stats.published7, icon: FileText, border: 'border-l-green-500' },
    { label: 'In Draft', value: stats.inDraft7, icon: Clock, border: 'border-l-orange-500' },
    { label: 'Pending Review', value: stats.pendingReview, icon: AlertCircle, border: 'border-l-amber-500' },
    { label: 'Total Queue', value: stats.total, icon: Database, border: 'border-l-gray-500' },
  ];

  const FILTER_TABS = [
    { value: 'all', label: 'All' },
    { value: 'pending_review', label: 'Pending Review' },
    { value: 'approved', label: 'Approved' },
    { value: 'published', label: 'Published' },
    { value: 'needs_revision', label: 'Needs Revision' },
    { value: 'briefed', label: 'Briefed' },
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
          {/* ZONE A — 7-Day Rearview */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {STAT_CARDS.map((s) => (
              <Card key={s.label} className={`rounded-xl border-l-4 ${s.border} shadow-sm`}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <s.icon size={16} className="text-muted-foreground shrink-0" />
                    <span className="text-2xl font-bold text-foreground">{s.value}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* ZONE B — 14-Day Calendar */}
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <button
              onClick={() => setCalendarOpen(!calendarOpen)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-accent/50 transition-colors"
            >
              <span>14-Day Content Calendar</span>
              {calendarOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {calendarOpen && (
              <div className="px-4 pb-4 overflow-x-auto">
                <div className="grid grid-cols-14 gap-1 min-w-[700px]" style={{ gridTemplateColumns: 'repeat(14, 1fr)' }}>
                  {calendarDays.map((day) => (
                    <div
                      key={day.label}
                      className={`rounded-lg p-2 min-h-[60px] text-center ${day.items.length === 0 ? 'bg-muted/10' : 'bg-card'}`}
                    >
                      <p className="text-[10px] font-semibold text-muted-foreground mb-1">{day.label}</p>
                      <div className="flex flex-wrap justify-center gap-1">
                        {day.items.map((item) => (
                          <Tooltip key={item.id}>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => setSelectedTask(item)}
                                className="w-3 h-3 rounded-full transition-transform hover:scale-150"
                                style={{ backgroundColor: CALENDAR_DOT_COLORS[item.content_type || ''] || '#6b7280' }}
                              />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs max-w-[200px]">
                              <p className="font-semibold">{item.title}</p>
                              <p className="text-muted-foreground">{TYPE_COLORS[item.content_type || '']?.label || item.content_type}</p>
                            </TooltipContent>
                          </Tooltip>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ZONE C + D layout */}
          <div className="flex flex-col lg:flex-row gap-4">
            {/* ZONE C — Approval Queue */}
            <div className="flex-1 min-w-0 space-y-3">
              {/* Filter tabs */}
              <div className="flex flex-wrap gap-1.5">
                {FILTER_TABS.map((tab) => (
                  <button
                    key={tab.value}
                    onClick={() => setFilterStatus(tab.value)}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
                      filterStatus === tab.value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/15 text-muted-foreground hover:bg-muted/25'
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Table */}
              <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/5">
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Title</th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground hidden md:table-cell">Type</th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground hidden md:table-cell">Status</th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground hidden lg:table-cell">Priority</th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground hidden lg:table-cell">Target</th>
                        <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTasks.length === 0 ? (
                        <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">No tasks match this filter</td></tr>
                      ) : (
                        filteredTasks.map((task) => (
                          <tr
                            key={task.id}
                            className="border-b border-border/50 hover:bg-accent/30 transition-colors cursor-pointer"
                            onClick={() => setSelectedTask(task)}
                          >
                            <td className="px-3 py-2.5">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div>
                                    <p className="font-medium text-foreground truncate max-w-[250px]">{task.title}</p>
                                    {task.target_keyword && (
                                      <p className="text-xs text-muted-foreground truncate max-w-[250px]">{task.target_keyword}</p>
                                    )}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[300px]">
                                  <p>{task.title}</p>
                                </TooltipContent>
                              </Tooltip>
                            </td>
                            <td className="px-3 py-2.5 hidden md:table-cell">
                              <TypeBadge type={task.content_type} />
                            </td>
                            <td className="px-3 py-2.5 hidden md:table-cell">
                              <StatusBadge status={task.status} />
                            </td>
                            <td className="px-3 py-2.5 hidden lg:table-cell">
                              {task.priority_score != null && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-foreground">{task.priority_score}</span>
                                  <div className="w-12 h-1.5 rounded-full bg-muted/20 overflow-hidden">
                                    <div
                                      className="h-full rounded-full"
                                      style={{
                                        width: `${task.priority_score}%`,
                                        backgroundColor: task.priority_score >= 70 ? '#ef4444' : task.priority_score >= 40 ? '#f59e0b' : '#6b7280',
                                      }}
                                    />
                                  </div>
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2.5 hidden lg:table-cell text-xs text-muted-foreground">
                              {task.target_publish_date ? format(new Date(task.target_publish_date), 'd MMM') : '—'}
                            </td>
                            <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                              {(task.status === 'draft' && !task.james_approved) || (task.status === 'in_progress' && task.draft_content) ? (
                                <Button size="sm" variant="outline" className="h-8 text-xs border-amber-500/50 text-amber-500 hover:bg-amber-500/10" onClick={() => setSelectedTask(task)}>
                                  Review
                                </Button>
                              ) : task.james_approved ? (
                                <span className="text-xs text-green-500 font-semibold flex items-center justify-end gap-1"><CheckCircle2 size={12} /> Approved</span>
                              ) : task.status === 'published' ? (
                                <span className="text-xs text-green-500 font-semibold flex items-center justify-end gap-1"><CheckCircle2 size={12} /> Published</span>
                              ) : (
                                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setSelectedTask(task)}>
                                  <Eye size={14} className="mr-1" /> View
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* ZONE D + E — Topic Loader + Suggestions (hidden mobile by default) */}
            <div className="hidden lg:block w-[320px] shrink-0 space-y-4">
              {/* Brief Emily */}
              <Card className="rounded-xl border border-border shadow-sm">
                <CardContent className="p-4 space-y-3">
                  <h3 className="font-semibold text-sm text-foreground flex items-center gap-2"><Pencil size={14} /> Brief Emily</h3>
                  <Input
                    placeholder="e.g. How to replace brake pads on a Toyota Hilux"
                    value={briefTopic}
                    onChange={(e) => setBriefTopic(e.target.value)}
                    className="text-sm"
                  />
                  <Select value={briefCategory} onValueChange={setBriefCategory}>
                    <SelectTrigger className="text-sm h-9"><SelectValue placeholder="Category" /></SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={briefType} onValueChange={setBriefType}>
                    <SelectTrigger className="text-sm h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="seo_article">SEO Article</SelectItem>
                      <SelectItem value="video_script">Video Script</SelectItem>
                      <SelectItem value="social_post">Social Post</SelectItem>
                      <SelectItem value="email_draft">Email Draft</SelectItem>
                    </SelectContent>
                  </Select>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left text-sm h-9 font-normal">
                        <CalendarIcon size={14} className="mr-2 shrink-0" />
                        {briefDate ? format(briefDate, 'dd MMM yyyy') : 'Target date (optional)'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={briefDate} onSelect={setBriefDate} className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                  <Button onClick={handleBriefSubmit} disabled={!briefTopic.trim() || briefing} className="w-full h-9 text-sm font-semibold">
                    <Plus size={14} className="mr-1.5" /> Add to Queue
                  </Button>
                </CardContent>
              </Card>

              {/* Emily Suggests */}
              <Card className="rounded-xl border border-border shadow-sm">
                <CardContent className="p-4 space-y-3">
                  <h3 className="font-semibold text-sm text-foreground flex items-center gap-2"><Sparkles size={14} className="text-secondary" /> Emily Suggests</h3>
                  {suggestions.map((s, i) => (
                    <div key={i} className="rounded-lg border border-border/50 p-3 space-y-1.5 bg-accent/30">
                      <p className="text-sm font-medium text-foreground leading-tight">{s.title}</p>
                      <div className="flex items-center gap-1.5">
                        {s.category && <span className="text-[10px] rounded-full bg-primary/10 text-primary px-2 py-0.5 font-semibold">{s.category}</span>}
                        <TypeBadge type={s.content_type} />
                      </div>
                      <p className="text-xs text-muted-foreground">{s.reason}</p>
                      <Button size="sm" variant="outline" className="h-7 text-xs w-full mt-1" onClick={() => handleAddSuggestion(s)}>
                        <Plus size={12} className="mr-1" /> Add to Queue
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ═══════════════════ LEDGER TAB ═══════════════════ */}
        <TabsContent value="ledger" className="space-y-4 mt-4">
          {/* Summary */}
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

          {/* Export */}
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={exportCsv} className="text-xs h-8">
              <Download size={14} className="mr-1.5" /> Export CSV
            </Button>
          </div>

          {/* Published table */}
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

              {/* Content */}
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

              {/* Actions */}
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
