import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { toast } from 'sonner';
import {
  CheckCircle2, XCircle, SkipForward, Pencil, Search,
  CalendarIcon, Loader2, Plus, Rocket, Send,
} from 'lucide-react';
import { Label } from '@/components/ui/label';
import { format, formatDistanceToNow } from 'date-fns';
import PageHeader from '@/components/PageHeader';

/* ─── Types ─── */
interface AeoArticle {
  id: string;
  task_id?: string | null;
  title: string;
  slug: string | null;
  category: string | null;
  content_type: string | null;
  target_keyword: string | null;
  psyops_stream: string | null;
  status: string;
  priority_score: number | null;
  draft_content: string | null;
  answer_first: string | null;
  answer_rest: string | null;
  related_slugs: string[] | null;
  james_approved: boolean;
  created_at: string;
  updated_at: string | null;
}

interface SocialItem {
  id: string;
  platform: string | null;
  draft_copy: string | null;
  psyops_stream: string | null;
  status: string;
  image_url: string | null;
  scheduled_for: string | null;
  created_at: string;
  updated_at: string | null;
}

interface EditorialItem {
  id: string;
  content_type: string | null;
  platform: string | null;
  psyops_phase: string | null;
  psyops_stream: string | null;
  draft_copy: string | null;
  status: string;
  approved_at: string | null;
  published_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
}

const STREAM_BADGE: Record<string, string> = {
  disrupt: 'bg-stream-disrupt/20 text-stream-disrupt',
  educate: 'bg-stream-educate/20 text-stream-educate',
  convert: 'bg-stream-convert/20 text-stream-convert',
  amplify: 'bg-stream-amplify/20 text-stream-amplify',
};

const PLATFORM_COLORS: Record<string, string> = {
  facebook: 'bg-[#1877F2]/20 text-[#1877F2]',
  instagram: 'bg-[#E1306C]/20 text-[#E1306C]',
  tiktok: 'bg-foreground/10 text-foreground',
  email: 'bg-warning/20 text-warning',
  sms: 'bg-success/20 text-success',
};

const CONTENT_TYPE_LABELS: Record<string, string> = {
  seo_article: 'SEO Article',
  ai_article: 'AI Article',
  regional_seo: 'Regional SEO',
  decision_page: 'Fitment Guide',
  fitment_guide: 'Fitment Guide',
  video_script: 'Video Script',
  social: 'Social',
  tiktok: 'TikTok',
};

function wordCount(text: string | null) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export default function Approvals() {
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const defaultTab = tabParam === 'editorial' ? 'editorial' : tabParam === 'publish' ? 'publish' : 'review';

  const [loading, setLoading] = useState(true);
  const [articles, setArticles] = useState<AeoArticle[]>([]);
  const [approvedArticles, setApprovedArticles] = useState<AeoArticle[]>([]);
  const [editorialItems, setEditorialItems] = useState<EditorialItem[]>([]);
  const [editorialStatusFilter, setEditorialStatusFilter] = useState<string>('pending');
  const [expandedEditorialId, setExpandedEditorialId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [streamFilter, setStreamFilter] = useState<string>('all');
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());

  // Edit modal state
  const [editArticle, setEditArticle] = useState<AeoArticle | null>(null);
  const [editSocial, setEditSocial] = useState<SocialItem | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editKeyword, setEditKeyword] = useState('');
  const [editSchedule, setEditSchedule] = useState<Date | undefined>();
  const [editImageUrl, setEditImageUrl] = useState('');

  // Lightbox
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Loading states for publish/send actions
  const [publishingIds, setPublishingIds] = useState<Set<string>>(new Set());
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());
  const [publishErrors, setPublishErrors] = useState<Record<string, string>>({});

  // Add/Edit Queue modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingQueueId, setEditingQueueId] = useState<string | null>(null);
  const [newTopic, setNewTopic] = useState('');
  const [newKeyword, setNewKeyword] = useState('');
  const [newStream, setNewStream] = useState('educate');
  const [newPriority, setNewPriority] = useState('normal');
  const [newNotes, setNewNotes] = useState('');
  const [addingToQueue, setAddingToQueue] = useState(false);
  const [generatingNow, setGeneratingNow] = useState(false);

  const fetchData = useCallback(async () => {
    const [aeoRes, approvedRes, editorialRes] = await Promise.all([
      supabase.from('mkt_seo_queue')
        .select('*')
        .eq('james_approved', false)
        .not('status', 'in', '("rejected","published")')
        .not('draft_content', 'is', null)
        .order('priority_score', { ascending: false }),
      supabase.from('mkt_seo_queue')
        .select('*')
        .eq('status', 'approved')
        .order('updated_at', { ascending: false }),
      supabase.from('mkt_content_queue')
        .select('*')
        .order('created_at', { ascending: false }),
    ]);
    if (aeoRes.data) setArticles(aeoRes.data);
    if (approvedRes.data) setApprovedArticles(approvedRes.data);
    if (editorialRes.data) setEditorialItems(editorialRes.data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Realtime
  useEffect(() => {
    const ch1 = supabase.channel('approvals-seo')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mkt_seo_queue' }, () => fetchData())
      .subscribe();
    const ch2 = supabase.channel('approvals-content')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mkt_content_queue' }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2); };
  }, [fetchData]);

  /* ─── Return to queue ─── */
  const returnToQueue = async (id: string) => {
    await supabase.from('mkt_seo_queue').update({ status: 'pending', james_approved: false, updated_at: new Date().toISOString() }).eq('id', id);
    setApprovedArticles(prev => prev.filter(a => a.id !== id));
    toast.success('Returned to queue');
    fetchData();
  };

  const returnAllToQueue = async () => {
    const ids = approvedArticles.map(a => a.id);
    if (!confirm(`Return ${ids.length} article${ids.length > 1 ? 's' : ''} to the queue?`)) return;
    await supabase.from('mkt_seo_queue').update({ status: 'pending', james_approved: false, updated_at: new Date().toISOString() }).in('id', ids);
    toast.success(`${ids.length} articles returned to queue`);
    fetchData();
  };

  /* ─── AEO actions ─── */
  const approveArticle = async (id: string) => {
    await supabase.from('mkt_seo_queue').update({ james_approved: true, status: 'approved', updated_at: new Date().toISOString() }).eq('id', id);
    setArticles(prev => prev.filter(a => a.id !== id));
    toast.success('Article approved');
  };

  const rejectArticle = async (id: string) => {
    if (!confirm('Reject this article? It will be marked as rejected and won\'t be published.')) return;
    await supabase.from('mkt_seo_queue').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', id);
    setArticles(prev => prev.filter(a => a.id !== id));
    toast.success('Article rejected');
  };

  const openEditArticle = (a: AeoArticle) => {
    setEditArticle(a);
    setEditTitle(a.title || '');
    setEditKeyword(a.target_keyword || '');
    setEditDraft(a.answer_first || a.draft_content || '');
  };

  const saveEditArticle = async () => {
    if (!editArticle) return;
    await supabase.from('mkt_seo_queue').update({
      title: editTitle, target_keyword: editKeyword,
      answer_first: editDraft, updated_at: new Date().toISOString(),
    }).eq('id', editArticle.id);
    setEditArticle(null);
    toast.success('Article updated');
    fetchData();
  };

  /* ─── Publish actions (with per-item loading) ─── */
  const publishArticle = async (article: AeoArticle) => {
    if (!article.slug) {
      toast.error('Cannot publish — this article has no slug');
      return;
    }
    setPublishingIds(prev => new Set(prev).add(article.id));
    setPublishErrors(prev => { const n = { ...prev }; delete n[article.id]; return n; });
    const { error } = await supabase.from('mkt_seo_queue').update({
      status: 'published',
      james_approved: true,
      updated_at: new Date().toISOString(),
    }).eq('id', article.id);
    setPublishingIds(prev => { const n = new Set(prev); n.delete(article.id); return n; });
    if (error) {
      setPublishErrors(prev => ({ ...prev, [article.id]: error.message }));
      toast.error('Publish failed: ' + error.message);
      return;
    }
    setApprovedArticles(prev => prev.filter(a => a.id !== article.id));
    fetchData();
    toast.success(
      <div>
        Published — live at{' '}
        <a href={`https://carfix.co.nz/guides/${article.slug}`} target="_blank" rel="noopener noreferrer" className="underline font-medium">
          carfix.co.nz/guides/{article.slug}
        </a>
      </div>
    );
  };

  /* ─── Send Now: approve + publish in one action ─── */
  const sendNow = async (article: AeoArticle) => {
    if (!article.slug) {
      toast.error('Cannot send — this article has no slug. Approve first, add slug, then publish.');
      return;
    }
    setSendingIds(prev => new Set(prev).add(article.id));
    const { error } = await supabase.from('mkt_seo_queue').update({
      status: 'published',
      james_approved: true,
      updated_at: new Date().toISOString(),
    }).eq('id', article.id);
    setSendingIds(prev => { const n = new Set(prev); n.delete(article.id); return n; });
    if (error) {
      toast.error('Send failed: ' + error.message);
      return;
    }
    setArticles(prev => prev.filter(a => a.id !== article.id));
    fetchData();
    toast.success(
      <div>
        Approved & Published — live at{' '}
        <a href={`https://carfix.co.nz/guides/${article.slug}`} target="_blank" rel="noopener noreferrer" className="underline font-medium">
          carfix.co.nz/guides/{article.slug}
        </a>
      </div>
    );
  };

  const openNewQueueModal = () => {
    setEditingQueueId(null);
    setNewTopic(''); setNewKeyword(''); setNewStream('educate'); setNewPriority('normal'); setNewNotes('');
    setShowAddModal(true);
  };

  /* ─── Add / Update Queue ─── */
  const addToQueue = async (generateImmediately: boolean) => {
    if (!newTopic.trim()) { toast.error('Topic is required'); return; }
    const setter = generateImmediately ? setGeneratingNow : setAddingToQueue;
    setter(true);
    const priorityMap: Record<string, number> = { high: 90, normal: 50, low: 10 };
    const fields = {
      title: newTopic.trim(),
      target_keyword: newKeyword.trim() || null,
      psyops_stream: newStream.toUpperCase(),
      priority_score: priorityMap[newPriority] || 50,
      updated_at: new Date().toISOString(),
    };

    let itemId = editingQueueId;

    if (editingQueueId) {
      const { error } = await supabase.from('mkt_seo_queue').update(fields).eq('id', editingQueueId);
      if (error) { setter(false); toast.error('Failed to update: ' + error.message); return; }
    } else {
      const row = {
        ...fields,
        status: 'pending',
        content_type: 'seo_article',
        notes: newNotes.trim() || null,
        created_at: new Date().toISOString(),
      };
      const { data: inserted, error } = await supabase.from('mkt_seo_queue').insert(row).select().single();
      if (error) { setter(false); toast.error('Failed to add: ' + error.message); return; }
      itemId = inserted?.id;
    }

    if (generateImmediately && itemId) {
      try {
        await supabase.functions.invoke('emily-chat', {
          body: { task_id: itemId, title: newTopic.trim(), target_keyword: newKeyword.trim() || null },
        });
        toast.success('Emily is generating content now. It will appear in Review shortly.');
      } catch {
        toast.success('Generation triggered but may take a moment.');
      }
    } else {
      toast.success(editingQueueId ? 'Queue item updated' : 'Item added to the queue');
    }
    setter(false);
    setShowAddModal(false);
    setEditingQueueId(null);
    setNewTopic(''); setNewKeyword(''); setNewStream('educate'); setNewPriority('normal'); setNewNotes('');
    fetchData();
  };

  const publishAll = async () => {
    const publishable = approvedArticles.filter(a => a.slug);
    const noSlug = approvedArticles.filter(a => !a.slug);
    if (publishable.length === 0) {
      toast.error('No articles have slugs — cannot publish');
      return;
    }
    if (!confirm(`Publish ${publishable.length} article${publishable.length > 1 ? 's' : ''}?${noSlug.length > 0 ? ` (${noSlug.length} skipped — missing slug)` : ''}`)) return;
    const ids = publishable.map(a => a.id);
    const { error } = await supabase.from('mkt_seo_queue').update({
      status: 'published',
      james_approved: true,
      updated_at: new Date().toISOString(),
    }).in('id', ids);
    if (error) {
      toast.error('Bulk publish failed: ' + error.message);
      return;
    }
    fetchData();
    toast.success(`Published ${publishable.length} articles`);
  };

  /* ─── Editorial actions ─── */
  const approveEditorial = async (id: string) => {
    await supabase.from('mkt_content_queue').update({ status: 'approved', approved_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id);
    toast.success('Editorial item approved');
    fetchData();
  };

  const rejectEditorial = async (id: string) => {
    if (!confirm('Reject this editorial item?')) return;
    await supabase.from('mkt_content_queue').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', id);
    toast.success('Editorial item rejected');
    fetchData();
  };

  const publishEditorial = async (id: string) => {
    const { error } = await supabase.from('mkt_content_queue').update({ status: 'published', published_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id);
    if (error) {
      toast.error('Publish failed: ' + error.message);
      return;
    }
    toast.success('Editorial item published');
    fetchData();
  };

  const saveEditSocial = async () => {
    if (!editSocial) return;
    await supabase.from('mkt_content_queue').update({
      draft_copy: editDraft, image_url: editImageUrl || null,
      scheduled_for: editSchedule?.toISOString() || null,
      updated_at: new Date().toISOString(),
    }).eq('id', editSocial.id);
    setEditSocial(null);
    toast.success('Updated');
    fetchData();
  };

  /* ─── Filtering ─── */
  const editorialPendingCount = editorialItems.filter(e => e.status === 'pending').length;
  const filterEditorial = editorialItems
    .filter(e => editorialStatusFilter === 'all' || e.status === editorialStatusFilter)
    .filter(e => streamFilter === 'all' || e.psyops_stream?.toLowerCase() === streamFilter)
    .filter(e => !search || e.draft_copy?.toLowerCase().includes(search.toLowerCase()));

  const filterArticles = articles
    .filter(a => !skippedIds.has(a.id))
    .filter(a => streamFilter === 'all' || a.psyops_stream?.toLowerCase() === streamFilter)
    .filter(a => !search || [a.title, a.target_keyword, a.answer_first].some(f => f?.toLowerCase().includes(search.toLowerCase())));

  const filterApproved = approvedArticles
    .filter(a => streamFilter === 'all' || a.psyops_stream?.toLowerCase() === streamFilter)
    .filter(a => !search || [a.title, a.target_keyword, a.category].some(f => f?.toLowerCase().includes(search.toLowerCase())));

  const reviewCount = articles.length;
  const publishCount = approvedArticles.length;
  const totalActionable = reviewCount + editorialPendingCount + publishCount;

  if (loading) {
    return (
      <div className="space-y-4 max-w-[1400px]">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-12 w-full" />
        <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-start justify-between gap-4">
        <PageHeader title="Approvals" description="Content waiting for your decision — review, approve, or publish." />
        <Button size="sm" className="h-8 text-xs shrink-0" onClick={openNewQueueModal}>
          <Plus size={14} className="mr-1" /> Add to Queue
        </Button>
      </div>

      {/* Action summary banner */}
      <Card className={`border-border ${totalActionable > 0 ? 'bg-warning/10 border-warning/30' : 'bg-secondary/50'}`}>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className={`font-semibold ${totalActionable > 0 ? 'text-warning' : 'text-foreground'}`}>
              {reviewCount} to review
            </span>
            <span className="text-muted-foreground">·</span>
            <span className={`font-semibold ${editorialPendingCount > 0 ? 'text-warning' : 'text-foreground'}`}>
              {editorialPendingCount} editorial
            </span>
            <span className="text-muted-foreground">·</span>
            <span className={`font-semibold ${publishCount > 0 ? 'text-warning' : 'text-foreground'}`}>
              {publishCount} to publish
            </span>
            {totalActionable === 0 && (
              <span className="text-xs text-muted-foreground ml-auto">All caught up.</span>
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue={defaultTab} className="w-full">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
          <TabsList className="bg-secondary flex-wrap">
            <TabsTrigger value="review">Review ({reviewCount})</TabsTrigger>
            <TabsTrigger value="editorial">Editorial ({editorialPendingCount})</TabsTrigger>
            <TabsTrigger value="publish">Publish ({publishCount})</TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-56">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs bg-secondary border-border"
              />
            </div>
            <Select value={streamFilter} onValueChange={setStreamFilter}>
              <SelectTrigger className="w-32 h-8 text-xs bg-secondary border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Streams</SelectItem>
                <SelectItem value="disrupt">Disrupt</SelectItem>
                <SelectItem value="educate">Educate</SelectItem>
                <SelectItem value="convert">Convert</SelectItem>
                <SelectItem value="amplify">Amplify</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ═══ REVIEW TAB ═══ */}
        <TabsContent value="review" className="space-y-4">
          {filterArticles.length === 0 ? (
            <Card><CardContent className="p-8 text-center">
              <p className="text-foreground">No articles awaiting approval. Emily's next run will populate this queue.</p>
            </CardContent></Card>
          ) : (
            filterArticles.map(article => {
              const stream = article.psyops_stream?.toLowerCase() || '';
              const badgeClass = STREAM_BADGE[stream] || 'bg-muted/20 text-muted-foreground';
              const preview = (article.answer_first || article.draft_content || '').slice(0, 200);
              const relatedCount = article.related_slugs?.filter(Boolean).length || 0;
              return (
                <Card key={article.id} className="border-border">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {stream && <Badge variant="outline" className={`${badgeClass} border-transparent text-[11px] font-semibold`}>{stream.toUpperCase()}</Badge>}
                        {article.category && <Badge variant="outline" className="text-[11px] text-muted-foreground border-border">{article.category}</Badge>}
                      </div>
                      {article.priority_score != null && (
                        <span className="text-xs font-bold text-muted-foreground bg-secondary px-2 py-0.5 rounded">{article.priority_score}</span>
                      )}
                    </div>

                    <h3 className="text-lg font-semibold text-foreground line-clamp-2">{article.title}</h3>

                    {article.target_keyword && (
                      <p className="text-xs text-muted-foreground">Target: {article.target_keyword}</p>
                    )}

                    {preview && (
                      <div className="bg-background rounded-md p-3 font-mono text-xs text-foreground">
                        {preview}{preview.length >= 200 ? '...' : ''}
                      </div>
                    )}

                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{wordCount(article.draft_content)} words</span>
                      {article.category && <span>{article.category}</span>}
                      {relatedCount > 0 && <span>{relatedCount} related</span>}
                      <Badge variant="outline" className="text-[10px] border-border">{article.status}</Badge>
                    </div>

                    <div className="flex items-center gap-2 justify-end">
                      <Button size="sm" className="h-8 text-xs bg-success hover:bg-success/90 text-primary-foreground" onClick={() => approveArticle(article.id)}>
                        <CheckCircle2 size={14} className="mr-1" /> Approve
                      </Button>
                      {article.slug && (
                        <Button
                          size="sm"
                          className="h-8 text-xs bg-primary hover:bg-primary/90 text-primary-foreground"
                          disabled={sendingIds.has(article.id)}
                          onClick={() => sendNow(article)}
                        >
                          {sendingIds.has(article.id) ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Send size={14} className="mr-1" />}
                          Send Now
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="h-8 text-xs border-primary text-primary hover:bg-primary/10" onClick={() => openEditArticle(article)}>
                        <Pencil size={14} className="mr-1" /> Edit
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-xs border-destructive text-destructive hover:bg-destructive/10" onClick={() => rejectArticle(article.id)}>
                        <XCircle size={14} className="mr-1" /> Reject
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground" onClick={() => setSkippedIds(p => new Set(p).add(article.id))}>
                        <SkipForward size={14} className="mr-1" /> Skip
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* ═══ EDITORIAL TAB ═══ */}
        <TabsContent value="editorial" className="space-y-4">
          <div className="flex items-center gap-2">
            <Select value={editorialStatusFilter} onValueChange={setEditorialStatusFilter}>
              <SelectTrigger className="w-40 h-8 text-xs bg-secondary border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="all">All Statuses</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {filterEditorial.length} item{filterEditorial.length !== 1 ? 's' : ''} · Social posts, emails, SMS, Canva briefs
            </p>
          </div>

          {filterEditorial.length === 0 ? (
            <Card><CardContent className="p-8 text-center">
              <p className="text-foreground">No editorial items matching this filter.</p>
            </CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filterEditorial.map(item => {
                const stream = item.psyops_stream?.toLowerCase() || '';
                const badgeClass = STREAM_BADGE[stream] || 'bg-muted/20 text-muted-foreground';
                const platClass = PLATFORM_COLORS[item.platform?.toLowerCase() || ''] || 'bg-muted/20 text-muted-foreground';
                const copy = item.draft_copy || '';
                const isExpanded = expandedEditorialId === item.id;
                const displayCopy = isExpanded || copy.length <= 200 ? copy : copy.slice(0, 200) + '...';

                return (
                  <Card key={item.id} className="border-border">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        {item.platform && (
                          <Badge variant="outline" className={`${platClass} border-transparent text-[11px] font-semibold`}>
                            {item.platform}
                          </Badge>
                        )}
                        {item.content_type && (
                          <Badge variant="outline" className="text-[10px] border-border">
                            {item.content_type.replace(/_/g, ' ')}
                          </Badge>
                        )}
                        {stream && (
                          <Badge variant="outline" className={`${badgeClass} border-transparent text-[10px] font-semibold`}>
                            {stream.toUpperCase()}
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[10px] border-border">{item.status}</Badge>
                      </div>

                      <div className="font-mono text-sm text-foreground whitespace-pre-wrap">
                        {displayCopy}
                        {copy.length > 200 && (
                          <button
                            className="text-primary text-xs ml-1"
                            onClick={() => setExpandedEditorialId(isExpanded ? null : item.id)}
                          >
                            {isExpanded ? 'Collapse' : 'Expand'}
                          </button>
                        )}
                      </div>

                      {item.notes && (
                        <p className="text-xs text-muted-foreground italic">Note: {item.notes}</p>
                      )}

                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>Created: {format(new Date(item.created_at), 'd MMM')}</span>
                        {item.approved_at && <span>Approved: {format(new Date(item.approved_at), 'd MMM')}</span>}
                        {item.published_at && <span>Published: {format(new Date(item.published_at), 'd MMM')}</span>}
                      </div>

                      <div className="flex items-center gap-2 justify-end">
                        {item.status === 'pending' && (
                          <>
                            <Button size="sm" className="h-8 text-xs bg-success hover:bg-success/90 text-primary-foreground" onClick={() => approveEditorial(item.id)}>
                              <CheckCircle2 size={14} className="mr-1" /> Approve
                            </Button>
                            <Button size="sm" variant="outline" className="h-8 text-xs border-destructive text-destructive hover:bg-destructive/10" onClick={() => rejectEditorial(item.id)}>
                              <XCircle size={14} className="mr-1" /> Reject
                            </Button>
                          </>
                        )}
                        {item.status === 'approved' && (
                          <Button size="sm" className="h-8 text-xs bg-primary hover:bg-primary/90 text-primary-foreground" onClick={() => publishEditorial(item.id)}>
                            <Rocket size={14} className="mr-1" /> Publish Now
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ═══ PUBLISH TAB ═══ */}
        <TabsContent value="publish" className="space-y-4">
          {filterApproved.length === 0 ? (
            <Card><CardContent className="p-8 text-center">
              <p className="text-foreground">No approved articles waiting to be published.</p>
            </CardContent></Card>
          ) : (
            <>
              {approvedArticles.length > 0 && (
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" className="h-8 text-xs border-warning text-warning hover:bg-warning/10" onClick={returnAllToQueue}>
                    ← Return All to Queue ({approvedArticles.length})
                  </Button>
                  <Button size="sm" className="h-8 text-xs bg-primary hover:bg-primary/90 text-primary-foreground" onClick={publishAll}>
                    <CheckCircle2 size={14} className="mr-1" /> Publish All ({approvedArticles.filter(a => a.slug).length})
                  </Button>
                </div>
              )}
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-secondary/70 text-muted-foreground text-xs">
                        <th className="text-left p-3 font-medium">Title</th>
                        <th className="text-left p-3 font-medium">Stream</th>
                        <th className="text-left p-3 font-medium">Category</th>
                        <th className="text-right p-3 font-medium">Words</th>
                        <th className="text-left p-3 font-medium">Approved</th>
                        <th className="text-center p-3 font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filterApproved.map(article => {
                        const stream = article.psyops_stream?.toLowerCase() || '';
                        const badgeClass = STREAM_BADGE[stream] || 'bg-muted/20 text-muted-foreground';
                        return (
                          <tr key={article.id} className="hover:bg-secondary/30">
                            <td className="p-3">
                              <span className="text-foreground font-medium line-clamp-1">{article.title}</span>
                              {article.target_keyword && (
                                <p className="text-[11px] text-muted-foreground mt-0.5">{article.target_keyword}</p>
                              )}
                              {!article.slug && (
                                <p className="text-[10px] text-destructive mt-0.5">⚠ No slug — cannot publish</p>
                              )}
                              {publishErrors[article.id] && (
                                <p className="text-[10px] text-destructive mt-0.5">Error: {publishErrors[article.id]}</p>
                              )}
                            </td>
                            <td className="p-3">
                              {stream && <Badge variant="outline" className={`${badgeClass} border-transparent text-[10px] font-semibold`}>{stream.toUpperCase()}</Badge>}
                            </td>
                            <td className="p-3 text-muted-foreground text-xs">{article.category || '—'}</td>
                            <td className="p-3 text-right text-muted-foreground text-xs">{wordCount(article.draft_content).toLocaleString()}</td>
                            <td className="p-3 text-muted-foreground text-xs">
                              {article.updated_at ? formatDistanceToNow(new Date(article.updated_at), { addSuffix: true }) : '—'}
                            </td>
                            <td className="p-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-[11px] border-warning text-warning hover:bg-warning/10 px-2"
                                  onClick={() => returnToQueue(article.id)}
                                >
                                  ← Queue
                                </Button>
                                <Button
                                  size="sm"
                                  className="h-7 text-xs bg-success hover:bg-success/90 text-primary-foreground"
                                  disabled={!article.slug || publishingIds.has(article.id)}
                                  onClick={() => publishArticle(article)}
                                >
                                  {publishingIds.has(article.id) ? <Loader2 size={14} className="mr-1 animate-spin" /> : null}
                                  {publishingIds.has(article.id) ? 'Publishing...' : 'Publish'}
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* ─── Edit Article Modal ─── */}
      <Dialog open={!!editArticle} onOpenChange={() => setEditArticle(null)}>
        <DialogContent className="bg-card border-border max-w-2xl">
          <DialogHeader><DialogTitle className="text-foreground">Edit Article</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-xs text-muted-foreground">Title</label>
              <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="bg-background border-border" /></div>
            <div><label className="text-xs text-muted-foreground">Target Keyword</label>
              <Input value={editKeyword} onChange={e => setEditKeyword(e.target.value)} className="bg-background border-border" /></div>
            <div><label className="text-xs text-muted-foreground">Content</label>
              <Textarea value={editDraft} onChange={e => setEditDraft(e.target.value)} rows={10} className="bg-background border-border font-mono text-xs" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditArticle(null)} className="border-border">Cancel</Button>
            <Button onClick={saveEditArticle} className="bg-primary text-primary-foreground">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit Social Modal ─── */}
      <Dialog open={!!editSocial} onOpenChange={() => setEditSocial(null)}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader><DialogTitle className="text-foreground">Edit Social Item</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-xs text-muted-foreground">Draft Copy</label>
              <Textarea value={editDraft} onChange={e => setEditDraft(e.target.value)} rows={6} className="bg-background border-border font-mono text-xs" /></div>
            <div><label className="text-xs text-muted-foreground">Image URL</label>
              <Input value={editImageUrl} onChange={e => setEditImageUrl(e.target.value)} className="bg-background border-border" /></div>
            <div><label className="text-xs text-muted-foreground">Schedule</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-xs border-border">
                    <CalendarIcon size={14} className="mr-2" />
                    {editSchedule ? format(editSchedule, 'd MMM yyyy') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={editSchedule} onSelect={setEditSchedule} /></PopoverContent>
              </Popover>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditSocial(null)} className="border-border">Cancel</Button>
            <Button onClick={saveEditSocial} className="bg-primary text-primary-foreground">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Add to Queue Modal ─── */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader><DialogTitle className="text-foreground">{editingQueueId ? 'Edit Queue Item' : 'Add to Queue'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">Topic / Title *</Label>
              <Input value={newTopic} onChange={e => setNewTopic(e.target.value)} placeholder="e.g. Best Brake Pads for Toyota Hilux" className="bg-background border-border" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Target Keyword</Label>
              <Input value={newKeyword} onChange={e => setNewKeyword(e.target.value)} placeholder="e.g. brake pads toyota hilux" className="bg-background border-border" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Stream</Label>
                <Select value={newStream} onValueChange={setNewStream}>
                  <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="disrupt">DISRUPT</SelectItem>
                    <SelectItem value="educate">EDUCATE</SelectItem>
                    <SelectItem value="convert">CONVERT</SelectItem>
                    <SelectItem value="amplify">AMPLIFY</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Priority</Label>
                <Select value={newPriority} onValueChange={setNewPriority}>
                  <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Notes for Emily</Label>
              <Textarea value={newNotes} onChange={e => setNewNotes(e.target.value)} placeholder="Any specific angle, audience, or requirements..." rows={3} className="bg-background border-border text-xs" />
            </div>
          </div>
          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setShowAddModal(false)} className="border-border">Cancel</Button>
            <Button
              variant="outline"
              className="border-primary text-primary hover:bg-primary/10"
              disabled={addingToQueue || generatingNow}
              onClick={() => addToQueue(false)}
            >
              {addingToQueue ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Plus size={14} className="mr-1" />}
              {editingQueueId ? 'Save Changes' : 'Add to Queue'}
            </Button>
            <Button
              className="bg-primary text-primary-foreground"
              disabled={addingToQueue || generatingNow}
              onClick={() => addToQueue(true)}
            >
              {generatingNow ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Rocket size={14} className="mr-1" />}
              {generatingNow ? 'Generating...' : 'Generate Now'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Lightbox ─── */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="Full size" className="max-w-[90vw] max-h-[90vh] rounded-lg" />
        </div>
      )}
    </div>
  );
}
