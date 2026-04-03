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
  CalendarIcon, Image as ImageIcon, ChevronDown,
} from 'lucide-react';
import { format } from 'date-fns';

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
  title: string;
  category: string | null;
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

function wordCount(text: string | null) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export default function Approvals() {
  const [loading, setLoading] = useState(true);
  const [articles, setArticles] = useState<AeoArticle[]>([]);
  const [socialItems, setSocialItems] = useState<SocialItem[]>([]);
  const [search, setSearch] = useState('');
  const [streamFilter, setStreamFilter] = useState<string>('all');
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
    const [aeoRes, socialRes] = await Promise.all([
      supabase.from('mkt_seo_queue')
        .select('*')
        .eq('james_approved', false)
        .not('draft_content', 'is', null)
        .order('priority_score', { ascending: false }),
      supabase.from('mkt_content_queue')
        .select('*')
        .eq('status', 'draft')
        .order('created_at', { ascending: false }),
    ]);
    if (aeoRes.data) setArticles(aeoRes.data);
    if (socialRes.data) setSocialItems(socialRes.data);
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
  const filterArticles = articles
    .filter(a => !skippedIds.has(a.id))
    .filter(a => streamFilter === 'all' || a.psyops_stream?.toLowerCase() === streamFilter)
    .filter(a => !search || [a.title, a.target_keyword, a.answer_first].some(f => f?.toLowerCase().includes(search.toLowerCase())));

  const filterSocial = socialItems
    .filter(s => streamFilter === 'all' || s.psyops_stream?.toLowerCase() === streamFilter)
    .filter(s => !search || s.draft_copy?.toLowerCase().includes(search.toLowerCase()));

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
      <h1 className="text-2xl font-bold text-foreground">Approvals</h1>

      <Tabs defaultValue="aeo" className="w-full">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
          <TabsList className="bg-secondary">
            <TabsTrigger value="aeo">AEO Articles ({articles.length})</TabsTrigger>
            <TabsTrigger value="social">Social & Campaign ({socialItems.length})</TabsTrigger>
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

        {/* ═══ AEO ARTICLES TAB ═══ */}
        <TabsContent value="aeo" className="space-y-4">
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

        {/* ═══ SOCIAL & CAMPAIGN TAB ═══ */}
        <TabsContent value="social" className="space-y-4">
          {filterSocial.length === 0 ? (
            <Card><CardContent className="p-8 text-center">
              <p className="text-foreground">No social or campaign items to approve. Emily's next run will populate this queue.</p>
            </CardContent></Card>
          ) : (
            filterSocial.map(item => (
              <SocialCard key={item.id} item={item}
                onApprove={approveSocial} onReject={rejectSocial}
                onEdit={openEditSocial} onLightbox={setLightboxUrl} />
            ))
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
