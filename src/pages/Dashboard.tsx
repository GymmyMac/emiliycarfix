import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
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
  expose: '#CC2200',
  amplify: '#7A5500',
  position: '#1A7A40',
  tribe: '#1A3A8A',
};

const PLATFORM_CONFIG: Record<string, { icon: React.ReactNode; color: string }> = {
  facebook: { icon: <Facebook size={16} />, color: '#1877F2' },
  instagram: { icon: <Instagram size={16} />, color: '#E4405F' },
  tiktok: { icon: <Music2 size={16} />, color: '#333333' },
  linkedin: { icon: <Linkedin size={16} />, color: '#0A66C2' },
  email: { icon: <Mail size={16} />, color: '#CC2200' },
  sms: { icon: <MessageSquare size={16} />, color: '#1A7A40' },
};

const REJECT_REASONS = ['Off-brand', 'Factual error', 'Wrong timing', 'Too long', 'Other'];

function formatDate() {
  return new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
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

  const fetchData = useCallback(async () => {
    const today = new Date().toISOString().split('T')[0];

    const [pendingRes, approvedRes, phaseRes] = await Promise.all([
      supabase
        .from('mkt_content_queue')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
      supabase
        .from('mkt_content_queue')
        .select('*')
        .eq('status', 'approved')
        .gte('approved_at', `${today}T00:00:00`)
        .lte('approved_at', `${today}T23:59:59`)
        .order('approved_at', { ascending: false }),
      supabase
        .from('mkt_content_queue')
        .select('psyops_phase')
        .gte('created_at', `${today}T00:00:00`)
        .lte('created_at', `${today}T23:59:59`)
        .order('created_at', { ascending: false })
        .limit(1),
    ]);

    if (pendingRes.data) setPending(pendingRes.data);
    if (approvedRes.data) setApproved(approvedRes.data);
    if (phaseRes.data && phaseRes.data.length > 0) {
      setTodayPhase(phaseRes.data[0].psyops_phase);
    } else {
      setTodayPhase(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('content-queue-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mkt_content_queue' },
        (payload) => {
          const newRow = payload.new as ContentItem;
          const oldRow = payload.old as ContentItem;

          if (payload.eventType === 'INSERT' && newRow.status === 'pending') {
            setPending((prev) => [newRow, ...prev]);
          }

          if (payload.eventType === 'UPDATE') {
            // Remove from pending
            setPending((prev) => prev.filter((item) => item.id !== newRow.id));

            if (newRow.status === 'approved') {
              const today = new Date().toISOString().split('T')[0];
              if (newRow.approved_at?.startsWith(today)) {
                setApproved((prev) => [newRow, ...prev]);
              }
            }

            if (newRow.status === 'pending') {
              setPending((prev) => [newRow, ...prev.filter((i) => i.id !== newRow.id)]);
            }
          }

          if (payload.eventType === 'DELETE') {
            setPending((prev) => prev.filter((item) => item.id !== oldRow.id));
            setApproved((prev) => prev.filter((item) => item.id !== oldRow.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleApprove = async (id: string) => {
    const { error } = await supabase
      .from('mkt_content_queue')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .eq('id', id);

    if (!error) {
      const item = pending.find((i) => i.id === id);
      setPending((prev) => prev.filter((i) => i.id !== id));
      if (item) {
        setApproved((prev) => [{ ...item, status: 'approved', approved_at: new Date().toISOString() }, ...prev]);
      }
      toast({ title: 'Approved', description: 'Content approved successfully.', className: 'border-[#1A7A40] bg-[#1A7A40]/20 text-foreground' });
    }
  };

  const handleStartEdit = (item: ContentItem) => {
    setEditingId(item.id);
    setEditText(item.draft_copy);
  };

  const handleSaveEdit = async (id: string) => {
    const { error } = await supabase
      .from('mkt_content_queue')
      .update({ draft_copy: editText })
      .eq('id', id);

    if (!error) {
      setPending((prev) =>
        prev.map((i) => (i.id === id ? { ...i, draft_copy: editText } : i))
      );
      setEditingId(null);
      toast({ title: 'Saved', description: 'Draft updated.' });
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  const handleReject = async (id: string) => {
    if (!rejectReason) return;
    const { error } = await supabase
      .from('mkt_content_queue')
      .update({ status: 'rejected', notes: rejectReason })
      .eq('id', id);

    if (!error) {
      setPending((prev) =>
        prev.map((i) => (i.id === id ? { ...i, status: 'rejected', notes: rejectReason } : i))
      );
      setRejectingId(null);
      setRejectReason('');
      toast({ title: 'Rejected', description: 'Content rejected.', variant: 'destructive' });
    }
  };

  const pendingCount = pending.filter((i) => i.status === 'pending').length;
  const activePending = pending.filter((i) => i.status === 'pending');
  const rejectedPending = pending.filter((i) => i.status === 'rejected');

  const PlatformIcon = ({ platform }: { platform: string }) => {
    const config = PLATFORM_CONFIG[platform?.toLowerCase()] || { icon: <Mail size={16} />, color: 'hsl(var(--muted-foreground))' };
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: config.color }}>
        {config.icon}
        <span className="capitalize">{platform}</span>
      </span>
    );
  };

  const PhaseBadge = ({ phase, size = 'sm' }: { phase: string; size?: 'sm' | 'md' }) => {
    const color = PHASE_COLORS[phase?.toLowerCase()] || '#666';
    return (
      <span
        className={`inline-flex items-center rounded-full font-semibold uppercase tracking-wide ${size === 'md' ? 'px-3 py-1 text-xs' : 'px-2 py-0.5 text-[10px]'}`}
        style={{ backgroundColor: `${color}22`, color, border: `1px solid ${color}44` }}
      >
        {phase}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* TOP BAR */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-5 py-3">
        <span className="text-sm font-medium text-muted-foreground">{formatDate()}</span>

        <div>
          {todayPhase ? (
            <PhaseBadge phase={`Today: ${todayPhase}`} size="md" />
          ) : (
            <span className="text-xs text-muted-foreground">No brief yet</span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {pendingCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-primary/20 px-2.5 py-0.5 text-xs font-semibold text-primary">
              {pendingCount} pending
            </span>
          )}
          <Button variant="outline" size="sm" disabled className="text-muted-foreground">
            Generate Brief
          </Button>
          <Button variant="ghost" size="icon" className="text-muted-foreground">
            <Bell size={18} />
          </Button>
        </div>
      </div>

      {/* PENDING CONTENT CARDS */}
      {activePending.length === 0 && rejectedPending.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-lg text-muted-foreground">Queue is clear.</p>
          <p className="text-sm text-muted-foreground mt-1">Emily is working on tomorrow's brief.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {activePending.map((item) => (
            <Card key={item.id} className="border-border bg-card">
              <CardContent className="p-5 space-y-4">
                {/* TOP ROW */}
                <div className="flex items-center justify-between">
                  <PlatformIcon platform={item.platform} />
                  <PhaseBadge phase={item.psyops_phase} />
                </div>

                {/* BODY */}
                {editingId === item.id ? (
                  <div className="space-y-3">
                    <Textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="min-h-[120px] bg-accent border-border text-foreground"
                    />
                    <p className="text-xs text-muted-foreground">{editText.length} characters</p>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleSaveEdit(item.id)} className="bg-[#7A5500] hover:bg-[#7A5500]/80 text-white">
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={handleCancelEdit}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{item.draft_copy}</p>
                    <p className="text-xs text-muted-foreground mt-2">{item.draft_copy?.length || 0} characters</p>
                  </div>
                )}

                {/* REJECT REASON DROPDOWN */}
                {rejectingId === item.id && (
                  <div className="flex items-center gap-2 pt-1">
                    <Select value={rejectReason} onValueChange={setRejectReason}>
                      <SelectTrigger className="w-48 h-8 text-xs bg-accent border-border">
                        <SelectValue placeholder="Select reason" />
                      </SelectTrigger>
                      <SelectContent>
                        {REJECT_REASONS.map((r) => (
                          <SelectItem key={r} value={r}>{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="destructive" onClick={() => handleReject(item.id)} disabled={!rejectReason} className="h-8 text-xs">
                      Confirm
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setRejectingId(null); setRejectReason(''); }} className="h-8 text-xs">
                      Cancel
                    </Button>
                  </div>
                )}

                {/* FOOTER ROW */}
                {editingId !== item.id && (
                  <div className="flex items-center justify-between pt-1 border-t border-border">
                    <span className="text-xs text-muted-foreground capitalize">{item.content_type}</span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleApprove(item.id)}
                        className="h-8 bg-[#1A7A40] hover:bg-[#1A7A40]/80 text-white text-xs"
                      >
                        <Check size={14} className="mr-1" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleStartEdit(item)}
                        className="h-8 bg-[#7A5500] hover:bg-[#7A5500]/80 text-white text-xs"
                      >
                        <Pencil size={14} className="mr-1" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setRejectingId(item.id)}
                        className="h-8 text-xs"
                      >
                        <X size={14} className="mr-1" /> Reject
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          {/* Rejected cards at bottom, dimmed */}
          {rejectedPending.map((item) => (
            <Card key={item.id} className="border-border bg-card opacity-40">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <PlatformIcon platform={item.platform} />
                  <PhaseBadge phase={item.psyops_phase} />
                </div>
                <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{item.draft_copy}</p>
                <p className="text-xs text-muted-foreground">Rejected: {item.notes}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* APPROVED SECTION */}
      {approved.length > 0 && (
        <>
          <Separator />
          <div className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Approved Today</h2>
            {approved.map((item) => (
              <Card key={item.id} className="border-border bg-card/60">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <PlatformIcon platform={item.platform} />
                    <span className="text-sm text-foreground">
                      {item.draft_copy?.length > 80
                        ? item.draft_copy.slice(0, 80) + '…'
                        : item.draft_copy}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                    {item.scheduled_for ? (
                      <span className="flex items-center gap-1"><Clock size={12} /> {new Date(item.scheduled_for).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                    ) : (
                      <span>Scheduling…</span>
                    )}
                    <Check size={16} className="text-[#1A7A40]" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
