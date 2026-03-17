import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Facebook, Instagram, Linkedin, Mail, MessageSquare, Music2,
  MoreVertical, Check, Minus, CalendarIcon, Copy, Eye, RefreshCw, Trash2, ExternalLink, X,
} from 'lucide-react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { cn } from '@/lib/utils';

interface ContentItem {
  id: string; platform: string; psyops_phase: string; draft_copy: string;
  content_type: string; status: string; created_at: string;
  approved_at: string | null; scheduled_for: string | null; published_at: string | null;
  notes: string | null; image_url: string | null;
  buffer_post_id: string | null; mailchimp_campaign_id: string | null;
}

const PHASE_COLORS: Record<string, string> = { expose: '#EF4444', amplify: '#FF8C00', position: '#22C55E', tribe: '#0052CC' };
const PLATFORM_CONFIG: Record<string, { icon: React.ReactNode; color: string }> = {
  facebook: { icon: <Facebook size={14} />, color: '#1877F2' }, instagram: { icon: <Instagram size={14} />, color: '#E1306C' },
  tiktok: { icon: <Music2 size={14} />, color: '#333333' }, linkedin: { icon: <Linkedin size={14} />, color: '#0A66C2' },
  email: { icon: <Mail size={14} />, color: '#0052CC' }, sms: { icon: <MessageSquare size={14} />, color: '#22C55E' },
};

function formatScheduleDate(dateStr: string | null) { if (!dateStr) return null; return format(new Date(dateStr), "EEE d MMM, h:mmaaa"); }

export default function ContentQueue() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);
  const [platformFilter, setPlatformFilter] = useState('all');
  const [phaseFilter, setPhaseFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState<Date>(subDays(new Date(), 30));
  const [dateTo, setDateTo] = useState<Date>(new Date());

  const fetchData = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('mkt_content_queue').select('*').in('status', ['approved', 'published', 'rejected']).gte('created_at', startOfDay(dateFrom).toISOString()).lte('created_at', endOfDay(dateTo).toISOString()).order('created_at', { ascending: false });
    if (data) setItems(data);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [dateFrom, dateTo]);

  const filtered = useMemo(() => items.filter((item) => {
    if (platformFilter !== 'all' && item.platform?.toLowerCase() !== platformFilter) return false;
    if (phaseFilter !== 'all' && item.psyops_phase?.toLowerCase() !== phaseFilter) return false;
    if (statusFilter !== 'all' && item.status !== statusFilter) return false;
    return true;
  }), [items, platformFilter, phaseFilter, statusFilter]);

  const now = new Date(); const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonthItems = items.filter((i) => new Date(i.created_at) >= monthStart);
  const approvedThisMonth = thisMonthItems.filter((i) => i.status === 'approved' || i.status === 'published').length;
  const publishedThisMonth = thisMonthItems.filter((i) => i.status === 'published').length;
  const pendingScheduling = items.filter((i) => i.status === 'approved' && !i.scheduled_for).length;
  const rejectedThisMonth = thisMonthItems.filter((i) => i.status === 'rejected').length;

  const clearFilters = () => { setPlatformFilter('all'); setPhaseFilter('all'); setStatusFilter('all'); setDateFrom(subDays(new Date(), 30)); setDateTo(new Date()); };
  const handleCopy = (text: string) => { navigator.clipboard.writeText(text); toast({ title: 'Copied' }); };
  const handleRequeue = async (item: ContentItem) => { await supabase.from('mkt_content_queue').insert({ platform: item.platform, psyops_phase: item.psyops_phase, draft_copy: item.draft_copy, content_type: item.content_type, status: 'pending', image_url: item.image_url }); toast({ title: 'Re-queued' }); };
  const handleDelete = async (id: string) => { await supabase.from('mkt_content_queue').delete().eq('id', id); setItems((prev) => prev.filter((i) => i.id !== id)); toast({ title: 'Deleted' }); };

  const PlatformCell = ({ platform }: { platform: string }) => {
    const config = PLATFORM_CONFIG[platform?.toLowerCase()] || { icon: <Mail size={14} />, color: '#64748B' };
    return <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: config.color }}>{config.icon}<span className="capitalize">{platform}</span></span>;
  };

  const PhaseBadge = ({ phase }: { phase: string }) => {
    const color = PHASE_COLORS[phase?.toLowerCase()] || '#64748B';
    return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ backgroundColor: `${color}18`, color, border: `1px solid ${color}30` }}>{phase}</span>;
  };

  const StatusBadge = ({ status }: { status: string }) => {
    const styles: Record<string, string> = { approved: 'bg-success/10 text-success border-success/30', published: 'bg-primary/10 text-primary border-primary/30', rejected: 'bg-destructive/10 text-destructive border-destructive/30' };
    return <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', styles[status] || '')}>{status}</span>;
  };

  const stats = [
    { label: 'Approved this month', value: approvedThisMonth },
    { label: 'Published this month', value: publishedThisMonth },
    { label: 'Pending scheduling', value: pendingScheduling },
    { label: 'Rejected this month', value: rejectedThisMonth },
  ];

  if (loading) return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-64 rounded-xl" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl text-foreground">Content Queue</h1>
        <p className="text-sm text-muted-foreground">{filtered.length} items total</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((s) => (
          <Card key={s.label} className="rounded-xl border border-border bg-card shadow-sm">
            <CardContent className="p-4"><p className="text-2xl font-bold text-foreground">{s.value}</p><p className="text-xs text-muted-foreground mt-1">{s.label}</p></CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={platformFilter} onValueChange={setPlatformFilter}><SelectTrigger className="w-36 h-9 text-xs"><SelectValue placeholder="Platform" /></SelectTrigger><SelectContent><SelectItem value="all">All Platforms</SelectItem><SelectItem value="facebook">Facebook</SelectItem><SelectItem value="instagram">Instagram</SelectItem><SelectItem value="tiktok">TikTok</SelectItem><SelectItem value="linkedin">LinkedIn</SelectItem><SelectItem value="email">Email</SelectItem><SelectItem value="sms">SMS</SelectItem></SelectContent></Select>
        <Select value={phaseFilter} onValueChange={setPhaseFilter}><SelectTrigger className="w-32 h-9 text-xs"><SelectValue placeholder="Phase" /></SelectTrigger><SelectContent><SelectItem value="all">All Phases</SelectItem><SelectItem value="expose">Expose</SelectItem><SelectItem value="amplify">Amplify</SelectItem><SelectItem value="position">Position</SelectItem><SelectItem value="tribe">Tribe</SelectItem></SelectContent></Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-32 h-9 text-xs"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="approved">Approved</SelectItem><SelectItem value="published">Published</SelectItem><SelectItem value="rejected">Rejected</SelectItem></SelectContent></Select>
        <Popover><PopoverTrigger asChild><Button variant="outline" size="sm" className="h-9 text-xs gap-1.5"><CalendarIcon size={12} />{format(dateFrom, 'dd MMM')}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={dateFrom} onSelect={(d) => d && setDateFrom(d)} className={cn("p-3 pointer-events-auto")} /></PopoverContent></Popover>
        <span className="text-xs text-muted-foreground">to</span>
        <Popover><PopoverTrigger asChild><Button variant="outline" size="sm" className="h-9 text-xs gap-1.5"><CalendarIcon size={12} />{format(dateTo, 'dd MMM')}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={dateTo} onSelect={(d) => d && setDateTo(d)} className={cn("p-3 pointer-events-auto")} /></PopoverContent></Popover>
        <Button variant="ghost" size="sm" className="h-9 text-xs text-muted-foreground" onClick={clearFilters}><X size={12} className="mr-1" /> Clear</Button>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-x-auto">
        <Table>
          <TableHeader><TableRow className="hover:bg-transparent"><TableHead className="text-xs">Platform</TableHead><TableHead className="text-xs">Phase</TableHead><TableHead className="text-xs w-[240px]">Preview</TableHead><TableHead className="text-xs text-center">Image</TableHead><TableHead className="text-xs">Scheduled</TableHead><TableHead className="text-xs">Published</TableHead><TableHead className="text-xs">Channel ID</TableHead><TableHead className="text-xs">Status</TableHead><TableHead className="text-xs w-10"></TableHead></TableRow></TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-12">No content found.</TableCell></TableRow>
            ) : filtered.map((item) => {
              const channelId = item.buffer_post_id || item.mailchimp_campaign_id;
              return (
                <TableRow key={item.id} className="cursor-pointer hover:bg-accent/50" onClick={() => setSelectedItem(item)}>
                  <TableCell><PlatformCell platform={item.platform} /></TableCell>
                  <TableCell><PhaseBadge phase={item.psyops_phase} /></TableCell>
                  <TableCell className="text-xs text-foreground max-w-[240px] truncate">{item.draft_copy?.length > 80 ? item.draft_copy.slice(0, 80) + '…' : item.draft_copy}</TableCell>
                  <TableCell className="text-center">{item.image_url ? <Check size={14} className="mx-auto text-success" /> : <Minus size={14} className="mx-auto text-muted-foreground" />}</TableCell>
                  <TableCell className="text-xs">{item.scheduled_for ? <span className="text-foreground">{formatScheduleDate(item.scheduled_for)}</span> : <span className="text-muted-foreground">Not scheduled</span>}</TableCell>
                  <TableCell className="text-xs">{item.published_at ? <span className="text-foreground">{formatScheduleDate(item.published_at)}</span> : item.status === 'approved' ? <span className="text-orange">Pending</span> : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">{channelId ? channelId.slice(0, 12) : '—'}</TableCell>
                  <TableCell><StatusBadge status={item.status} /></TableCell>
                  <TableCell>
                    <DropdownMenu><DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}><Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical size={14} /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelectedItem(item); }}><Eye size={14} className="mr-2" /> View</DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleCopy(item.draft_copy); }}><Copy size={14} className="mr-2" /> Copy</DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleRequeue(item); }}><RefreshCw size={14} className="mr-2" /> Re-queue</DropdownMenuItem>
                        {item.status === 'rejected' && <DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}><Trash2 size={14} className="mr-2" /> Delete</DropdownMenuItem>}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Sheet open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <SheetContent className="w-[440px] sm:max-w-[440px] overflow-y-auto">
          {selectedItem && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2"><PlatformCell platform={selectedItem.platform} /><StatusBadge status={selectedItem.status} /></SheetTitle>
                <SheetDescription>Full content details</SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-5">
                <div><p className="text-xs font-medium text-muted-foreground mb-1">Draft Copy</p><p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{selectedItem.draft_copy}</p></div>
                {selectedItem.image_url && <div><p className="text-xs font-medium text-muted-foreground mb-1">Image</p><img src={selectedItem.image_url} alt="Content" className="rounded-xl border border-border max-h-48 object-cover w-full" /></div>}
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Phase</span><PhaseBadge phase={selectedItem.psyops_phase} /></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span className="capitalize text-foreground">{selectedItem.content_type}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span className="text-foreground">{formatScheduleDate(selectedItem.created_at)}</span></div>
                  {selectedItem.approved_at && <div className="flex justify-between"><span className="text-muted-foreground">Approved</span><span className="text-foreground">{formatScheduleDate(selectedItem.approved_at)}</span></div>}
                  <div className="flex justify-between"><span className="text-muted-foreground">Scheduled</span><span className="text-foreground">{formatScheduleDate(selectedItem.scheduled_for) || 'Not scheduled'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Published</span><span className="text-foreground">{formatScheduleDate(selectedItem.published_at) || '—'}</span></div>
                  {selectedItem.notes && <div className="flex justify-between"><span className="text-muted-foreground">Notes</span><span className="text-foreground">{selectedItem.notes}</span></div>}
                </div>
                <div className="space-y-2 pt-2 border-t border-border">
                  {selectedItem.buffer_post_id && <a href="https://buffer.com/manage" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-primary hover:underline"><ExternalLink size={12} /> Buffer ({selectedItem.buffer_post_id.slice(0, 12)})</a>}
                  {selectedItem.mailchimp_campaign_id && <a href="https://mailchimp.com/campaigns" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-primary hover:underline"><ExternalLink size={12} /> Mailchimp ({selectedItem.mailchimp_campaign_id.slice(0, 12)})</a>}
                </div>
                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline" className="text-xs h-11" onClick={() => handleCopy(selectedItem.draft_copy)}><Copy size={12} className="mr-1" /> Copy</Button>
                  <Button size="sm" variant="outline" className="text-xs h-11" onClick={() => handleRequeue(selectedItem)}><RefreshCw size={12} className="mr-1" /> Re-queue</Button>
                  {selectedItem.status === 'rejected' && <Button size="sm" variant="destructive" className="text-xs h-11" onClick={() => { handleDelete(selectedItem.id); setSelectedItem(null); }}><Trash2 size={12} className="mr-1" /> Delete</Button>}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
