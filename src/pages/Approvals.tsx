import { useEffect, useState, useCallback } from 'react';
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
  CalendarIcon, Image as ImageIcon, ChevronDown, ExternalLink,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

/* ─── Social Card Component ─── */
function SocialCard({ item, onApprove, onReject, onEdit, onLightbox }: {
  item: SocialItem;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onEdit: (item: SocialItem) => void;
  onLightbox: (url: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const stream = item.psyops_stream?.toLowerCase() || '';
  const badgeClass = STREAM_BADGE[stream] || 'bg-muted/20 text-muted-foreground';
  const platClass = PLATFORM_COLORS[item.platform?.toLowerCase() || ''] || 'bg-muted/20 text-muted-foreground';
  const copy = item.draft_copy || '';
  const truncated = copy.length > 280;

  return (
    <Card className="border-border">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          {item.platform && <Badge variant="outline" className={`${platClass} border-transparent text-[11px] font-semibold`}>{item.platform}</Badge>}
          {stream && <Badge variant="outline" className={`${badgeClass} border-transparent text-[11px] font-semibold`}>{stream.toUpperCase()}</Badge>}
          <Badge variant="outline" className="text-[10px] border-border">{item.status}</Badge>
        </div>
        <div className="font-mono text-sm text-foreground whitespace-pre-wrap">
          {expanded || !truncated ? copy : copy.slice(0, 280) + '...'}
          {truncated && (
            <button className="text-primary text-xs ml-1" onClick={() => setExpanded(!expanded)}>
              {expanded ? 'Collapse' : 'Expand'}
            </button>
          )}
        </div>
        {item.image_url && (
          <button onClick={() => onLightbox(item.image_url)} className="block">
            <img src={item.image_url} alt="Content" className="w-[200px] h-[150px] object-cover rounded-md border border-border" />
          </button>
        )}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>{item.scheduled_for ? `Scheduled: ${format(new Date(item.scheduled_for), 'd MMM HH:mm')}` : 'Not scheduled'}</span>
          <span>Created: {format(new Date(item.created_at), 'd MMM')}</span>
        </div>
        <div className="flex items-center gap-2 justify-end">
          <Button size="sm" className="h-8 text-xs bg-success hover:bg-success/90 text-primary-foreground" onClick={() => onApprove(item.id)}>
            <CheckCircle2 size={14} className="mr-1" /> Approve
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs border-primary text-primary hover:bg-primary/10" onClick={() => onEdit(item)}>
            <Pencil size={14} className="mr-1" /> Edit
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs border-destructive text-destructive hover:bg-destructive/10" onClick={() => onReject(item.id)}>
            <XCircle size={14} className="mr-1" /> Reject
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

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
  const [loading, setLoading] = useState(true);
  const [queuedArticles, setQueuedArticles] = useState<AeoArticle[]>([]);
  const [articles, setArticles] = useState<AeoArticle[]>([]);
  const [approvedArticles, setApprovedArticles] = useState<AeoArticle[]>([]);
  const [socialItems, setSocialItems] = useState<SocialItem[]>([]);
  const [publishedArticles, setPublishedArticles] = useState<AeoArticle[]>([]);
  const [search, setSearch] = useState('');
  const [streamFilter, setStreamFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [contentTypeFilter, setContentTypeFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('priority');
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

  const fetchData = useCallback(async () => {
    const [queuedRes, aeoRes, approvedRes, socialRes, publishedRes] = await Promise.all([
      supabase.from('mkt_seo_queue')
        .select('*')
        .eq('status', 'pending')
        .order('priority_score', { ascending: false }),
      supabase.from('mkt_seo_queue')
        .select('*')
        .eq('james_approved', false)
        .not('draft_content', 'is', null)
        .order('priority_score', { ascending: false }),
      supabase.from('mkt_seo_queue')
        .select('*')
        .eq('status', 'approved')
        .order('updated_at', { ascending: false }),
      supabase.from('mkt_content_queue')
        .select('*')
        .eq('status', 'draft')
        .order('created_at', { ascending: false }),
      supabase.from('mkt_seo_queue')
        .select('*')
        .eq('status', 'published')
        .order('updated_at', { ascending: false }),
    ]);
    if (queuedRes.data) setQueuedArticles(queuedRes.data);
    if (aeoRes.data) setArticles(aeoRes.data);
    if (approvedRes.data) setApprovedArticles(approvedRes.data);
    if (socialRes.data) setSocialItems(socialRes.data);
    if (publishedRes.data) setPublishedArticles(publishedRes.data);
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

  /* ─── Social actions ─── */
  const approveSocial = async (id: string) => {
    await supabase.from('mkt_content_queue').update({ status: 'approved', updated_at: new Date().toISOString() }).eq('id', id);
    setSocialItems(prev => prev.filter(s => s.id !== id));
    toast.success('Approved');
  };

  const rejectSocial = async (id: string) => {
    if (!confirm('Reject this item?')) return;
    await supabase.from('mkt_content_queue').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', id);
    setSocialItems(prev => prev.filter(s => s.id !== id));
    toast.success('Rejected');
  };

  const openEditSocial = (s: SocialItem) => {
    setEditSocial(s);
    setEditDraft(s.draft_copy || '');
    setEditImageUrl(s.image_url || '');
    setEditSchedule(s.scheduled_for ? new Date(s.scheduled_for) : undefined);
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
  const filterQueued = queuedArticles
    .filter(a => streamFilter === 'all' || a.psyops_stream?.toLowerCase() === streamFilter)
    .filter(a => categoryFilter === 'all' || a.category?.toLowerCase() === categoryFilter)
    .filter(a => contentTypeFilter === 'all' || a.content_type?.toLowerCase() === contentTypeFilter)
    .filter(a => !search || [a.title, a.target_keyword, a.category].some(f => f?.toLowerCase().includes(search.toLowerCase())));

  const filterArticles = articles
    .filter(a => !skippedIds.has(a.id))
    .filter(a => streamFilter === 'all' || a.psyops_stream?.toLowerCase() === streamFilter)
    .filter(a => !search || [a.title, a.target_keyword, a.answer_first].some(f => f?.toLowerCase().includes(search.toLowerCase())));

  const filterApproved = approvedArticles
    .filter(a => streamFilter === 'all' || a.psyops_stream?.toLowerCase() === streamFilter)
    .filter(a => categoryFilter === 'all' || a.category?.toLowerCase() === categoryFilter)
    .filter(a => !search || [a.title, a.target_keyword, a.category].some(f => f?.toLowerCase().includes(search.toLowerCase())));

  const filterSocial = socialItems
    .filter(s => streamFilter === 'all' || s.psyops_stream?.toLowerCase() === streamFilter)
    .filter(s => !search || s.draft_copy?.toLowerCase().includes(search.toLowerCase()));

  const filterPublished = publishedArticles
    .filter(a => streamFilter === 'all' || a.psyops_stream?.toLowerCase() === streamFilter)
    .filter(a => categoryFilter === 'all' || a.category?.toLowerCase() === categoryFilter)
    .filter(a => !search || [a.title, a.target_keyword, a.category].some(f => f?.toLowerCase().includes(search.toLowerCase())));

  const publishedCategories = [...new Set(publishedArticles.map(a => a.category).filter(Boolean))] as string[];
  const streamCounts = publishedArticles.reduce<Record<string, number>>((acc, a) => {
    const s = a.psyops_stream?.toLowerCase() || 'unknown';
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});
  const totalPublishedWords = publishedArticles.reduce((sum, a) => sum + wordCount(a.draft_content), 0);

  // Queue stats
  const queuedCategories = [...new Set(queuedArticles.map(a => a.category).filter(Boolean))] as string[];
  const queuedContentTypes = [...new Set(queuedArticles.map(a => a.content_type).filter(Boolean))] as string[];
  const queuedByType = queuedArticles.reduce<Record<string, number>>((acc, a) => {
    const t = a.content_type || 'unknown';
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});
  const estimatedDays = Math.ceil(queuedArticles.length / 11); // ~10-12/day avg

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
      <h1 className="text-2xl font-bold text-foreground">Pipeline</h1>

      <Tabs defaultValue="queue" className="w-full">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
          <TabsList className="bg-secondary">
            <TabsTrigger value="queue">Queue ({queuedArticles.length})</TabsTrigger>
            <TabsTrigger value="signoff">Sign-off ({articles.length})</TabsTrigger>
            <TabsTrigger value="approved">Approved ({approvedArticles.length})</TabsTrigger>
            <TabsTrigger value="published">Published ({publishedArticles.length})</TabsTrigger>
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

        {/* ═══ QUEUE TAB ═══ */}
        <TabsContent value="queue" className="space-y-4">
          {/* Summary stats */}
          <Card className="border-border bg-secondary/50">
            <CardContent className="p-4 space-y-2">
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <span className="text-foreground font-semibold">{queuedArticles.length} queued</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground">~{estimatedDays} days at current rate</span>
              </div>
              {Object.keys(queuedByType).length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {Object.entries(queuedByType)
                    .sort((a, b) => b[1] - a[1])
                    .map(([type, count]) => (
                      <span key={type}>{count} {CONTENT_TYPE_LABELS[type] || type}</span>
                    ))
                    .reduce<React.ReactNode[]>((acc, el, i) => {
                      if (i > 0) acc.push(<span key={`sep-${i}`}>·</span>);
                      acc.push(el);
                      return acc;
                    }, [])}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Queue filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={contentTypeFilter} onValueChange={setContentTypeFilter}>
              <SelectTrigger className="w-40 h-8 text-xs bg-secondary border-border">
                <SelectValue placeholder="Content Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {queuedContentTypes.map(ct => (
                  <SelectItem key={ct} value={ct.toLowerCase()}>{CONTENT_TYPE_LABELS[ct] || ct}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-40 h-8 text-xs bg-secondary border-border">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {queuedCategories.map(cat => (
                  <SelectItem key={cat} value={cat.toLowerCase()}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {filterQueued.length === 0 ? (
            <Card><CardContent className="p-8 text-center">
              <p className="text-foreground">No articles in the queue. The pipeline is clear.</p>
            </CardContent></Card>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-secondary/70 text-muted-foreground text-xs">
                      <th className="text-left p-3 font-medium w-12">ID</th>
                      <th className="text-left p-3 font-medium">Title</th>
                      <th className="text-left p-3 font-medium">Type</th>
                      <th className="text-left p-3 font-medium">Category</th>
                      <th className="text-right p-3 font-medium">Priority</th>
                      <th className="text-left p-3 font-medium">Stream</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filterQueued.map(article => {
                      const stream = article.psyops_stream?.toLowerCase() || '';
                      const badgeClass = STREAM_BADGE[stream] || 'bg-muted/20 text-muted-foreground';
                      const typeLabel = CONTENT_TYPE_LABELS[article.content_type || ''] || article.content_type || '—';
                      return (
                        <tr key={article.id} className="hover:bg-secondary/30">
                          <td className="p-3 text-xs text-muted-foreground font-mono">
                            {article.task_id ? article.task_id.slice(0, 8) : article.id.slice(0, 8)}
                          </td>
                          <td className="p-3">
                            <span className="text-foreground font-medium line-clamp-1">{article.title}</span>
                          </td>
                          <td className="p-3">
                            <Badge variant="outline" className="text-[10px] border-border font-normal">{typeLabel}</Badge>
                          </td>
                          <td className="p-3 text-muted-foreground text-xs">{article.category || '—'}</td>
                          <td className="p-3 text-right">
                            {article.priority_score != null ? (
                              <span className="text-xs font-bold text-foreground bg-secondary px-2 py-0.5 rounded">{article.priority_score}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="p-3">
                            {stream && <Badge variant="outline" className={`${badgeClass} border-transparent text-[10px] font-semibold`}>{stream.toUpperCase()}</Badge>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ═══ SIGN-OFF TAB ═══ */}
        <TabsContent value="signoff" className="space-y-4">
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
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {stream && <Badge variant="outline" className={`${badgeClass} border-transparent text-[11px] font-semibold`}>{stream.toUpperCase()}</Badge>}
                        {article.category && <Badge variant="outline" className="text-[11px] text-muted-foreground border-border">{article.category}</Badge>}
                      </div>
                      {article.priority_score != null && (
                        <span className="text-xs font-bold text-muted-foreground bg-secondary px-2 py-0.5 rounded">{article.priority_score}</span>
                      )}
                    </div>

                    {/* Title */}
                    <h3 className="text-lg font-semibold text-foreground line-clamp-2">{article.title}</h3>

                    {/* Keyword */}
                    {article.target_keyword && (
                      <p className="text-xs text-muted-foreground">Target: {article.target_keyword}</p>
                    )}

                    {/* 90-second answer preview */}
                    {preview && (
                      <div className="bg-background rounded-md p-3 font-mono text-xs text-foreground">
                        {preview}{preview.length >= 200 ? '...' : ''}
                      </div>
                    )}

                    {/* Metadata */}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{wordCount(article.draft_content)} words</span>
                      {article.category && <span>{article.category}</span>}
                      {relatedCount > 0 && <span>{relatedCount} related</span>}
                      <Badge variant="outline" className="text-[10px] border-border">{article.status}</Badge>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 justify-end">
                      <Button size="sm" className="h-8 text-xs bg-success hover:bg-success/90 text-primary-foreground" onClick={() => approveArticle(article.id)}>
                        <CheckCircle2 size={14} className="mr-1" /> Approve
                      </Button>
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

        {/* ═══ APPROVED TAB ═══ */}
        <TabsContent value="approved" className="space-y-4">
          {/* Category filter */}
          {queuedCategories.length > 0 && (
            <div className="flex items-center gap-2">
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-40 h-8 text-xs bg-secondary border-border">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {[...new Set(approvedArticles.map(a => a.category).filter(Boolean))].map(cat => (
                    <SelectItem key={cat as string} value={(cat as string).toLowerCase()}>{cat as string}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {filterApproved.length === 0 ? (
            <Card><CardContent className="p-8 text-center">
              <p className="text-foreground">No approved articles waiting to be published.</p>
            </CardContent></Card>
          ) : (
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
                          </td>
                          <td className="p-3">
                            {stream && <Badge variant="outline" className={`${badgeClass} border-transparent text-[10px] font-semibold`}>{stream.toUpperCase()}</Badge>}
                          </td>
                          <td className="p-3 text-muted-foreground text-xs">{article.category || '—'}</td>
                          <td className="p-3 text-right text-muted-foreground text-xs">{wordCount(article.draft_content).toLocaleString()}</td>
                          <td className="p-3 text-muted-foreground text-xs">
                            {article.updated_at ? formatDistanceToNow(new Date(article.updated_at), { addSuffix: true }) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ═══ SOCIAL & CAMPAIGN (hidden but kept for social tab access) ═══ */}

        {/* ═══ PUBLISHED TAB ═══ */}
        <TabsContent value="published" className="space-y-4">
          {/* Summary stats */}
          <Card className="border-border bg-secondary/50">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <span className="text-foreground font-semibold">{publishedArticles.length} published</span>
                <span className="text-muted-foreground">·</span>
                {Object.entries(streamCounts).map(([stream, count]) => {
                  const badgeClass = STREAM_BADGE[stream] || 'bg-muted/20 text-muted-foreground';
                  return (
                    <span key={stream} className="flex items-center gap-1">
                      <Badge variant="outline" className={`${badgeClass} border-transparent text-[10px] font-semibold`}>{stream.toUpperCase()}</Badge>
                      <span className="text-xs text-muted-foreground">{count}</span>
                    </span>
                  );
                })}
                <span className="text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground">{totalPublishedWords.toLocaleString()} total words</span>
              </div>
            </CardContent>
          </Card>

          {/* Category filter (published-only) */}
          {publishedCategories.length > 0 && (
            <div className="flex items-center gap-2">
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-40 h-8 text-xs bg-secondary border-border">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {publishedCategories.map(cat => (
                    <SelectItem key={cat} value={cat.toLowerCase()}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {filterPublished.length === 0 ? (
            <Card><CardContent className="p-8 text-center">
              <p className="text-foreground">No published articles yet.</p>
            </CardContent></Card>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-secondary/70 text-muted-foreground text-xs">
                      <th className="text-left p-3 font-medium">Title</th>
                      <th className="text-left p-3 font-medium">Stream</th>
                      <th className="text-left p-3 font-medium">Category</th>
                      <th className="text-right p-3 font-medium">Words</th>
                      <th className="text-left p-3 font-medium">Published</th>
                      <th className="text-center p-3 font-medium">Live</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filterPublished.map(article => {
                      const stream = article.psyops_stream?.toLowerCase() || '';
                      const badgeClass = STREAM_BADGE[stream] || 'bg-muted/20 text-muted-foreground';
                      const liveUrl = article.slug ? `https://carfix.co.nz/guides/${article.slug}` : null;
                      return (
                        <tr key={article.id} className="hover:bg-secondary/30">
                          <td className="p-3">
                            {liveUrl ? (
                              <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium line-clamp-1">
                                {article.title}
                              </a>
                            ) : (
                              <span className="text-foreground font-medium line-clamp-1">{article.title}</span>
                            )}
                            {article.target_keyword && (
                              <p className="text-[11px] text-muted-foreground mt-0.5">{article.target_keyword}</p>
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
                            {liveUrl ? (
                              <a href={liveUrl} target="_blank" rel="noopener noreferrer">
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-primary">
                                  <ExternalLink size={14} />
                                </Button>
                              </a>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
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

      {/* ─── Lightbox ─── */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="Full size" className="max-w-[90vw] max-h-[90vh] rounded-lg" />
        </div>
      )}
    </div>
  );
}
