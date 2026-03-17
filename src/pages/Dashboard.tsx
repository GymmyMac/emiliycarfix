import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import {
  Bell,
  Check,
  Facebook,
  Instagram,
  Linkedin,
  Mail,
  MessageSquare,
  Music2,
  Pencil,
  X,
  Clock,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ContentItem {
  id: string;
  platform: string;
  psyops_phase: string;
  draft_copy: string;
  content_type: string;
  status: string;
  created_at: string;
  approved_at: string | null;
  scheduled_for: string | null;
  notes: string | null;
}

const PHASE_COLORS: Record<string, string> = {
  expose: '#EF4444',
  amplify: '#FF8C00',
  position: '#22C55E',
  tribe: '#0052CC',
};

const PLATFORM_CONFIG: Record<string, { icon: React.ReactNode; color: string }> = {
  facebook: { icon: <Facebook size={16} />, color: '#1877F2' },
  instagram: { icon: <Instagram size={16} />, color: '#E1306C' },
  tiktok: { icon: <Music2 size={16} />, color: '#333333' },
  linkedin: { icon: <Linkedin size={16} />, color: '#0A66C2' },
  email: { icon: <Mail size={16} />, color: '#0052CC' },
  sms: { icon: <MessageSquare size={16} />, color: '#22C55E' },
};

const REJECT_REASONS = ['Off-brand', 'Factual error', 'Wrong timing', 'Too long', 'Other'];

/** Strip markdown formatting for clean display */
function stripMarkdown(text: string): string {
  if (!text) return '';
  return text
    .replace(/#{1,6}\s?/g, '')       // ## headers
    .replace(/\*\*(.+?)\*\*/g, '$1') // **bold**
    .replace(/\*(.+?)\*/g, '$1')     // *italic*
    .replace(/__(.+?)__/g, '$1')     // __bold__
    .replace(/_(.+?)_/g, '$1')       // _italic_
    .replace(/~~(.+?)~~/g, '$1')     // ~~strike~~
    .replace(/`(.+?)`/g, '$1')       // `code`
    .replace(/^\s*[-*+]\s+/gm, '')   // bullet points
    .replace(/^\s*\d+\.\s+/gm, '')   // numbered lists
    .replace(/\[(.+?)\]\(.+?\)/g, '$1') // [links](url)
    .trim();
}

function formatDate() {
  return new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function CharWarning({ text, platform }: { text: string; platform: string }) {
  const len = text?.length || 0;
  const isEmail = platform?.toLowerCase() === 'email';
  const isSocial = ['facebook', 'instagram', 'tiktok', 'linkedin'].includes(platform?.toLowerCase());
  const warn = (isEmail && len > 500) || (isSocial && len > 150);
  const hint = isEmail && len > 500
    ? 'consider shortening for email'
    : isSocial && len > 150
      ? 'consider shortening for social'
      : '';

  return (
    <p className={`text-xs mt-1 ${warn ? 'text-orange font-medium' : 'text-muted-foreground'}`}>
      {len} chars{hint ? ` — ${hint}` : ''}
    </p>
  );
}

/** Parse email draft_copy into structured sections */
function parseEmailContent(text: string): { subject: string; preview: string; body: string } | null {
  if (!text) return null;
  const previewMatch = text.match(/PREVIEW:\s*([\s\S]*?)(?=BODY:|$)/i);
  const bodyMatch = text.match(/BODY:\s*([\s\S]*)/i);
  
  if (!previewMatch && !bodyMatch) return null;
  
  // Subject is everything before PREVIEW: (or first line)
  const previewIdx = text.search(/PREVIEW:/i);
  const subject = previewIdx > 0
    ? stripMarkdown(text.slice(0, previewIdx).trim())
    : '';
  const preview = previewMatch ? stripMarkdown(previewMatch[1].trim()) : '';
  const body = bodyMatch ? stripMarkdown(bodyMatch[1].trim()) : stripMarkdown(text);
  
  return { subject, preview, body };
}

function DraftText({ text, platform, id }: { text: string; platform: string; id: string }) {
  const [expanded, setExpanded] = useState(false);
  const isEmail = platform?.toLowerCase() === 'email';

  // Email: structured display
  if (isEmail) {
    const parsed = parseEmailContent(text);
    if (parsed) {
      const bodyPreview = parsed.body.length > 150 && !expanded
        ? parsed.body.slice(0, 150)
        : parsed.body;
      return (
        <div className="space-y-1.5">
          {parsed.subject && (
            <p className="text-base font-bold text-foreground break-words">{parsed.subject}</p>
          )}
          {parsed.preview && (
            <p className="text-sm italic text-muted-foreground break-words">{parsed.preview}</p>
          )}
          <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
            {bodyPreview}
            {parsed.body.length > 150 && !expanded && (
              <button onClick={() => setExpanded(true)} className="text-primary font-medium ml-1 inline">
                ... tap to read more
              </button>
            )}
          </p>
          {expanded && parsed.body.length > 150 && (
            <button onClick={() => setExpanded(false)} className="text-primary text-sm font-medium">
              Show less
            </button>
          )}
        </div>
      );
    }
  }

  // Social / fallback: plain text
  const clean = stripMarkdown(text);
  return (
    <div>
      <p className="text-base leading-relaxed text-foreground whitespace-pre-wrap break-words">{clean}</p>
    </div>
  );
}

export default function Dashboard() {
  const [pending, setPending] = useState<ContentItem[]>([]);
  const [approved, setApproved] = useState<ContentItem[]>([]);
  const [todayPhase, setTodayPhase] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [collapsedRejected, setCollapsedRejected] = useState<Record<string, boolean>>({});

  const fetchData = useCallback(async () => {
    const today = new Date().toISOString().split('T')[0];
    const [pendingRes, approvedRes, phaseRes] = await Promise.all([
      supabase.from('mkt_content_queue').select('*').eq('status', 'pending').order('created_at', { ascending: false }),
      supabase.from('mkt_content_queue').select('*').eq('status', 'approved').gte('approved_at', `${today}T00:00:00`).lte('approved_at', `${today}T23:59:59`).order('approved_at', { ascending: false }),
      supabase.from('mkt_content_queue').select('psyops_phase').gte('created_at', `${today}T00:00:00`).lte('created_at', `${today}T23:59:59`).order('created_at', { ascending: false }).limit(1),
    ]);
    if (pendingRes.data) setPending(pendingRes.data);
    if (approvedRes.data) setApproved(approvedRes.data);
    if (phaseRes.data && phaseRes.data.length > 0) setTodayPhase(phaseRes.data[0].psyops_phase);
    else setTodayPhase(null);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const channel = supabase
      .channel('content-queue-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mkt_content_queue' }, (payload) => {
        const newRow = payload.new as ContentItem;
        const oldRow = payload.old as ContentItem;
        if (payload.eventType === 'INSERT' && newRow.status === 'pending') setPending((prev) => [newRow, ...prev]);
        if (payload.eventType === 'UPDATE') {
          setPending((prev) => prev.filter((item) => item.id !== newRow.id));
          if (newRow.status === 'approved') {
            const today = new Date().toISOString().split('T')[0];
            if (newRow.approved_at?.startsWith(today)) setApproved((prev) => [newRow, ...prev]);
          }
          if (newRow.status === 'pending') setPending((prev) => [newRow, ...prev.filter((i) => i.id !== newRow.id)]);
        }
        if (payload.eventType === 'DELETE') {
          setPending((prev) => prev.filter((item) => item.id !== oldRow.id));
          setApproved((prev) => prev.filter((item) => item.id !== oldRow.id));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleApprove = async (id: string) => {
    const { error } = await supabase.from('mkt_content_queue').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', id);
    if (!error) {
      const item = pending.find((i) => i.id === id);
      setPending((prev) => prev.filter((i) => i.id !== id));
      if (item) setApproved((prev) => [{ ...item, status: 'approved', approved_at: new Date().toISOString() }, ...prev]);
      toast({ title: 'Approved', description: 'Content approved successfully.' });
    }
  };

  const handleStartEdit = (item: ContentItem) => { setEditingId(item.id); setEditText(item.draft_copy); };

  const handleSaveEdit = async (id: string) => {
    const { error } = await supabase.from('mkt_content_queue').update({ draft_copy: editText }).eq('id', id);
    if (!error) {
      setPending((prev) => prev.map((i) => (i.id === id ? { ...i, draft_copy: editText } : i)));
      setEditingId(null);
      toast({ title: 'Saved', description: 'Draft updated.' });
    }
  };

  const handleCancelEdit = () => { setEditingId(null); setEditText(''); };

  const handleReject = async (id: string) => {
    if (!rejectReason) return;
    const { error } = await supabase.from('mkt_content_queue').update({ status: 'rejected', notes: rejectReason }).eq('id', id);
    if (!error) {
      setPending((prev) => prev.map((i) => (i.id === id ? { ...i, status: 'rejected', notes: rejectReason } : i)));
      setRejectingId(null);
      setRejectReason('');
      toast({ title: 'Rejected', description: 'Content rejected.', variant: 'destructive' });
    }
  };

  const pendingCount = pending.filter((i) => i.status === 'pending').length;
  const activePending = pending.filter((i) => i.status === 'pending');
  const rejectedPending = pending.filter((i) => i.status === 'rejected');

  const PlatformIcon = ({ platform }: { platform: string }) => {
    const config = PLATFORM_CONFIG[platform?.toLowerCase()] || { icon: <Mail size={16} />, color: '#64748B' };
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-bold" style={{ color: config.color }}>
        {config.icon}
        <span className="capitalize">{platform}</span>
      </span>
    );
  };

  const PhaseBadge = ({ phase, size = 'sm' }: { phase: string; size?: 'sm' | 'md' }) => {
    const color = PHASE_COLORS[phase?.toLowerCase()] || '#64748B';
    return (
      <span
        className={`inline-flex items-center rounded-full font-semibold uppercase tracking-wide shrink-0 ${size === 'md' ? 'px-3 py-1 text-xs' : 'px-2 py-0.5 text-[10px]'}`}
        style={{ backgroundColor: `${color}18`, color, border: `1px solid ${color}30` }}
      >
        {phase}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="space-y-4 px-0">
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4 w-full max-w-full overflow-x-hidden">
      {/* TOP BAR */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3 w-full">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">{formatDate()}</span>
          {pendingCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-orange/10 px-2.5 py-0.5 text-xs font-semibold text-orange shrink-0">
              {pendingCount} pending
            </span>
          )}
        </div>
        {todayPhase && (
          <div className="flex justify-center">
            <PhaseBadge phase={`Today: ${todayPhase}`} size="md" />
          </div>
        )}
        <Button className="w-full h-11 font-semibold text-sm" disabled>
          Generate Brief
        </Button>
      </div>

      {/* PENDING CONTENT CARDS */}
      {activePending.length === 0 && rejectedPending.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <h2 className="font-display text-lg text-foreground">Queue is clear.</h2>
          <p className="text-sm text-muted-foreground mt-1">Emily is working on tomorrow's brief.</p>
        </div>
      ) : (
        <div className="space-y-3 w-full">
          {activePending.map((item) => (
            <Card key={item.id} className="rounded-xl border border-border bg-card shadow-sm hover:shadow-md transition-all duration-300 hover:scale-[1.01] w-full overflow-hidden">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <PlatformIcon platform={item.platform} />
                  <PhaseBadge phase={item.psyops_phase} />
                </div>

                {editingId === item.id ? (
                  <div className="space-y-3">
                    <Textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="min-h-[120px] text-base"
                    />
                    <p className="text-xs text-muted-foreground">{editText.length} characters</p>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleSaveEdit(item.id)} className="h-11 flex-1">Save</Button>
                      <Button size="sm" variant="outline" onClick={handleCancelEdit} className="h-11 flex-1">Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <DraftText text={item.draft_copy} platform={item.platform} id={item.id} />
                )}

                {rejectingId === item.id && (
                  <div className="space-y-2">
                    <Select value={rejectReason} onValueChange={setRejectReason}>
                      <SelectTrigger className="h-11 text-sm">
                        <SelectValue placeholder="Select reason" />
                      </SelectTrigger>
                      <SelectContent>
                        {REJECT_REASONS.map((r) => (
                          <SelectItem key={r} value={r}>{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-2">
                      <Button variant="destructive" onClick={() => handleReject(item.id)} disabled={!rejectReason} className="h-11 flex-1 font-semibold">Confirm Reject</Button>
                      <Button variant="outline" onClick={() => { setRejectingId(null); setRejectReason(''); }} className="h-11 flex-1">Cancel</Button>
                    </div>
                  </div>
                )}

                {editingId !== item.id && rejectingId !== item.id && (
                  <div className="flex flex-col md:flex-row gap-2 pt-2 border-t border-border">
                    <Button onClick={() => handleApprove(item.id)} className="h-12 md:h-11 flex-1 font-semibold text-[16px] md:text-sm">
                      <Check size={16} className="mr-1.5 shrink-0" /> Approve
                    </Button>
                    <Button variant="outline" onClick={() => handleStartEdit(item)} className="h-12 md:h-11 flex-1 font-semibold text-[16px] md:text-sm">
                      <Pencil size={16} className="mr-1.5 shrink-0" /> Edit
                    </Button>
                    <Button variant="destructive" onClick={() => setRejectingId(item.id)} className="h-12 md:h-11 flex-1 font-semibold text-[16px] md:text-sm">
                      <X size={16} className="mr-1.5 shrink-0" /> Reject
                    </Button>
                  </div>
                )}

                {/* Character count below action buttons */}
                {editingId !== item.id && (
                  <CharWarning text={item.draft_copy} platform={item.platform} />
                )}
              </CardContent>
            </Card>
          ))}

          {/* Rejected cards — collapsed on mobile */}
          {rejectedPending.map((item) => (
            <Card
              key={item.id}
              className="rounded-xl border border-border bg-card shadow-sm opacity-50 border-l-4 border-l-destructive cursor-pointer md:cursor-default w-full overflow-hidden"
              onClick={() => setCollapsedRejected((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
            >
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <PlatformIcon platform={item.platform} />
                  <span className="inline-flex items-center rounded-full bg-destructive/10 text-destructive px-2 py-0.5 text-[10px] font-semibold uppercase shrink-0">Rejected</span>
                </div>
                <div className={`md:block ${collapsedRejected[item.id] ? 'block' : 'hidden'}`}>
                  <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">{stripMarkdown(item.draft_copy)}</p>
                  <p className="text-xs text-muted-foreground mt-1">Reason: {item.notes}</p>
                </div>
                <p className="text-xs text-muted-foreground md:hidden">
                  {collapsedRejected[item.id] ? 'Tap to collapse' : 'Tap to expand'}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* APPROVED TODAY */}
      {approved.length > 0 && (
        <div className="space-y-3 pt-4 border-t border-border w-full">
          <h2 className="font-display text-sm uppercase tracking-widest text-muted-foreground">Approved Today</h2>
          {approved.map((item) => (
            <Card key={item.id} className="rounded-xl border border-border bg-card shadow-sm border-l-4 border-l-success opacity-90 w-full overflow-hidden">
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <PlatformIcon platform={item.platform} />
                  <span className="text-sm text-foreground truncate">
                    {stripMarkdown(item.draft_copy)?.length > 80 ? stripMarkdown(item.draft_copy).slice(0, 80) + '…' : stripMarkdown(item.draft_copy)}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                  {item.scheduled_for ? (
                    <span className="flex items-center gap-1"><Clock size={12} /> {new Date(item.scheduled_for).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                  ) : (
                    <span>Scheduling…</span>
                  )}
                  <span className="inline-flex items-center rounded-full bg-success/10 text-success px-2 py-0.5 text-[10px] font-semibold uppercase">Approved</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
