import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Plus,
  X,
  Facebook,
  Instagram,
  Linkedin,
  Music2,
  Mail,
  MessageSquare,
} from 'lucide-react';

interface ContentItem {
  id: string;
  platform: string;
  draft_copy: string;
  psyops_phase: string;
  status: string;
  scheduled_for: string | null;
  content_type: string;
  buffer_post_id?: string | null;
  mailchimp_campaign_id?: string | null;
}

const PLATFORMS = ['facebook', 'instagram', 'tiktok', 'linkedin', 'email', 'sms'] as const;

const PLATFORM_COLORS: Record<string, string> = {
  facebook: '#1877F2',
  instagram: '#E1306C',
  tiktok: '#2A2A2A',
  linkedin: '#0A66C2',
  email: '#CC2200',
  sms: '#1A7A40',
};

const PLATFORM_ICONS: Record<string, React.ReactNode> = {
  facebook: <Facebook size={14} />,
  instagram: <Instagram size={14} />,
  tiktok: <Music2 size={14} />,
  linkedin: <Linkedin size={14} />,
  email: <Mail size={14} />,
  sms: <MessageSquare size={14} />,
};

const PHASE_COLORS: Record<string, string> = {
  expose: '#CC2200',
  amplify: '#7A5500',
  position: '#1A7A40',
  tribe: '#1A3A8A',
};

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getMonday(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function formatShortDate(d: Date) {
  return `${d.getDate()} ${d.toLocaleDateString('en-NZ', { month: 'short' })}`;
}

function formatDayHeader(d: Date) {
  return `${DAY_NAMES[((d.getDay() + 6) % 7)]} ${d.getDate()}`;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getFirstDayOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function getDaysInMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export default function CalendarPage() {
  const navigate = useNavigate();
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [items, setItems] = useState<ContentItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'week' | 'month'>('week');
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);
  const [expandedDay, setExpandedDay] = useState<Date | null>(null);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  // For month view
  const monthStart = useMemo(() => getFirstDayOfMonth(weekStart), [weekStart]);
  const daysInMonth = useMemo(() => getDaysInMonth(weekStart), [weekStart]);
  const monthFirstDayOfWeek = useMemo(() => ((monthStart.getDay() + 6) % 7), [monthStart]);

  const fetchData = useCallback(async () => {
    let rangeStart: string;
    let rangeEnd: string;

    if (view === 'week') {
      rangeStart = weekStart.toISOString();
      rangeEnd = addDays(weekEnd, 1).toISOString();
    } else {
      const ms = new Date(weekStart.getFullYear(), weekStart.getMonth(), 1);
      const me = new Date(weekStart.getFullYear(), weekStart.getMonth() + 1, 0, 23, 59, 59);
      rangeStart = ms.toISOString();
      rangeEnd = me.toISOString();
    }

    const [contentRes, pendingRes] = await Promise.all([
      supabase
        .from('mkt_content_queue')
        .select('*')
        .in('status', ['approved', 'published'])
        .gte('scheduled_for', rangeStart)
        .lte('scheduled_for', rangeEnd)
        .order('scheduled_for', { ascending: true }),
      supabase
        .from('mkt_content_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending'),
    ]);

    setItems(contentRes.data || []);
    setPendingCount(pendingRes.count || 0);
    setLoading(false);
  }, [weekStart, weekEnd, view]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('calendar-queue-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mkt_content_queue' },
        () => { fetchData(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const getItemsForCell = (day: Date, platform: string) =>
    items.filter((item) => {
      if (!item.scheduled_for) return false;
      const d = new Date(item.scheduled_for);
      return isSameDay(d, day) && item.platform?.toLowerCase() === platform;
    });

  const getItemsForDay = (day: Date) =>
    items.filter((item) => {
      if (!item.scheduled_for) return false;
      return isSameDay(new Date(item.scheduled_for), day);
    });

  const handleEmptyClick = (platform: string, day: Date) => {
    const dayStr = day.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' });
    navigate(`/emily?prompt=${encodeURIComponent(`Create a ${platform} post for ${dayStr}`)}`);
  };

  // Summary counts
  const socialCount = items.filter((i) => ['facebook', 'instagram', 'tiktok', 'linkedin'].includes(i.platform?.toLowerCase())).length;
  const emailCount = items.filter((i) => i.platform?.toLowerCase() === 'email').length;
  const smsCount = items.filter((i) => i.platform?.toLowerCase() === 'sms').length;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[500px] w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold text-foreground">Campaign Calendar</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, view === 'week' ? -7 : -30))}>
            <ChevronLeft size={14} />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(getMonday(new Date()))}>
            This Week
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, view === 'week' ? 7 : 30))}>
            <ChevronRight size={14} />
          </Button>
          <span className="text-sm text-muted-foreground px-2">
            {formatShortDate(weekStart)} — {formatShortDate(view === 'week' ? weekEnd : new Date(weekStart.getFullYear(), weekStart.getMonth() + 1, 0))}
          </span>
          <div className="flex rounded-md border border-border overflow-hidden ml-2">
            <button
              onClick={() => setView('week')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${view === 'week' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50'}`}
            >
              Week
            </button>
            <button
              onClick={() => setView('month')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${view === 'month' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50'}`}
            >
              Month
            </button>
          </div>
        </div>
      </div>

      <div className={`flex gap-4 ${view === 'month' ? 'flex-col' : ''}`}>
        {/* WEEK VIEW */}
        {view === 'week' && (
          <div className="flex-1 overflow-x-auto">
            <div className="min-w-[700px]">
              {/* Day headers */}
              <div className="grid grid-cols-[100px_repeat(7,1fr)] gap-px">
                <div />
                {weekDays.map((day) => (
                  <div
                    key={day.toISOString()}
                    className={`text-center text-xs font-medium py-2 rounded-t ${
                      isSameDay(day, today) ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
                    }`}
                  >
                    {formatDayHeader(day)}
                  </div>
                ))}
              </div>

              {/* Platform rows */}
              {PLATFORMS.map((platform) => (
                <div key={platform} className="grid grid-cols-[100px_repeat(7,1fr)] gap-px">
                  {/* Row header */}
                  <div className="flex items-center gap-1.5 px-2 py-3 text-xs font-medium capitalize" style={{ color: PLATFORM_COLORS[platform] }}>
                    {PLATFORM_ICONS[platform]}
                    {platform}
                  </div>

                  {/* Day cells */}
                  {weekDays.map((day) => {
                    const cellItems = getItemsForCell(day, platform);
                    const isToday = isSameDay(day, today);
                    return (
                      <div
                        key={`${platform}-${day.toISOString()}`}
                        className={`min-h-[60px] rounded border p-1 transition-colors group ${
                          isToday ? 'bg-primary/5 border-primary/20' : 'border-dashed border-border/50 hover:border-border'
                        }`}
                      >
                        {cellItems.length > 0 ? (
                          <div className="space-y-1">
                            {cellItems.map((item) => (
                              <button
                                key={item.id}
                                onClick={() => setSelectedItem(item)}
                                className="w-full text-left rounded px-1.5 py-1 text-[10px] leading-tight text-white truncate"
                                style={{
                                  backgroundColor: PLATFORM_COLORS[platform],
                                  border: platform === 'tiktok' ? '1px solid hsl(0 0% 90%)' : 'none',
                                }}
                              >
                                {item.draft_copy?.slice(0, 40)}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <button
                            onClick={() => handleEmptyClick(platform, day)}
                            className="w-full h-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Plus size={14} className="text-muted-foreground" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MONTH VIEW */}
        {view === 'month' && (
          <div className="flex-1">
            {/* Day name headers */}
            <div className="grid grid-cols-7 gap-px mb-1">
              {DAY_NAMES.map((d) => (
                <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px">
              {/* Empty cells before month start */}
              {Array.from({ length: monthFirstDayOfWeek }, (_, i) => (
                <div key={`empty-${i}`} className="min-h-[80px] rounded border border-transparent" />
              ))}
              {/* Day cells */}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = new Date(weekStart.getFullYear(), weekStart.getMonth(), i + 1);
                const dayItems = getItemsForDay(day);
                const isToday = isSameDay(day, today);
                const isExpanded = expandedDay && isSameDay(expandedDay, day);
                return (
                  <div key={i} className="relative">
                    <button
                      onClick={() => setExpandedDay(isExpanded ? null : day)}
                      className={`w-full min-h-[80px] rounded border p-1.5 text-left transition-colors ${
                        isToday ? 'bg-primary/5 border-primary/20' : 'border-border/50 hover:border-border'
                      }`}
                    >
                      <span className={`text-xs font-medium ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>{i + 1}</span>
                      {dayItems.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {dayItems.map((item) => (
                            <span
                              key={item.id}
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: PLATFORM_COLORS[item.platform?.toLowerCase()] || '#666' }}
                            />
                          ))}
                        </div>
                      )}
                    </button>
                    {isExpanded && dayItems.length > 0 && (
                      <div className="absolute z-20 top-full left-0 mt-1 w-56 rounded-lg border border-border bg-card shadow-lg p-2 space-y-1">
                        {dayItems.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => { setSelectedItem(item); setExpandedDay(null); }}
                            className="w-full text-left rounded px-2 py-1.5 text-xs text-foreground hover:bg-accent truncate flex items-center gap-2"
                          >
                            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: PLATFORM_COLORS[item.platform?.toLowerCase()] || '#666' }} />
                            {item.draft_copy?.slice(0, 50)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SUMMARY PANEL */}
        <div className="w-48 shrink-0 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">This Week</h3>
          <SummaryStat label="Social posts" value={socialCount} />
          <SummaryStat label="Emails queued" value={emailCount} />
          <SummaryStat label="SMS queued" value={smsCount} />
          <SummaryStat label="Pending approval" value={pendingCount} highlight />
        </div>
      </div>

      {/* DETAIL MODAL */}
      <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent className="bg-card border-border text-foreground max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 capitalize" style={{ color: PLATFORM_COLORS[selectedItem?.platform?.toLowerCase() || ''] }}>
              {PLATFORM_ICONS[selectedItem?.platform?.toLowerCase() || '']}
              {selectedItem?.platform}
            </DialogTitle>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{selectedItem.draft_copy}</p>
              <div className="flex flex-wrap gap-2">
                {selectedItem.psyops_phase && (
                  <span
                    className="inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase"
                    style={{
                      color: PHASE_COLORS[selectedItem.psyops_phase?.toLowerCase()] || '#666',
                      backgroundColor: `${PHASE_COLORS[selectedItem.psyops_phase?.toLowerCase()] || '#666'}22`,
                      border: `1px solid ${PHASE_COLORS[selectedItem.psyops_phase?.toLowerCase()] || '#666'}44`,
                    }}
                  >
                    {selectedItem.psyops_phase}
                  </span>
                )}
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase ${
                  selectedItem.status === 'published' ? 'bg-[#1A7A40]/20 text-[#1A7A40]' : 'bg-[#7A5500]/20 text-[#7A5500]'
                }`}>
                  {selectedItem.status}
                </span>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                {selectedItem.scheduled_for && (
                  <p>Scheduled: {new Date(selectedItem.scheduled_for).toLocaleString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</p>
                )}
                {selectedItem.buffer_post_id && <p>Buffer ID: {selectedItem.buffer_post_id}</p>}
                {selectedItem.mailchimp_campaign_id && <p>Mailchimp ID: {selectedItem.mailchimp_campaign_id}</p>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryStat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold ${highlight ? 'text-primary' : 'text-foreground'}`}>{value}</p>
    </div>
  );
}
