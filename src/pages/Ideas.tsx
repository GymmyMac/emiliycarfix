import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Mic, MicOff, MoreVertical, Loader2, Sparkles, ShieldCheck, Archive, Rocket, ChevronDown, ChevronUp } from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useDroppable } from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';
import { useIsMobile } from '@/hooks/use-mobile';

interface Idea {
  id: string;
  inbox_type: string;
  raw_idea: string;
  status: string;
  created_at: string;
  pressure_test_score?: number | null;
  pressure_test_summary?: string | null;
}

type InboxType = 'instant' | 'weekly' | 'parking_lot';

const COLUMNS: { key: InboxType; label: string }[] = [
  { key: 'instant', label: 'INSTANT INBOX' },
  { key: 'weekly', label: 'WEEKLY INBOX' },
  { key: 'parking_lot', label: 'PARKING LOT' },
];

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  raw: { bg: 'bg-border', text: 'text-muted-foreground' },
  processed: { bg: 'bg-success/10', text: 'text-success' },
  parked: { bg: 'bg-orange/10', text: 'text-orange' },
};

function timeAgo(dateStr: string) {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return '1 day ago';
  return `${diffDays} days ago`;
}

function isOverdue(createdAt: string) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  return new Date(createdAt) <= sevenDaysAgo;
}

function scoreColor(score: number) {
  if (score >= 80) return 'bg-[#16A34A]';
  if (score >= 60) return 'bg-primary';
  if (score >= 40) return 'bg-[#D97706]';
  return 'bg-destructive';
}

function scoreTextColor(score: number) {
  if (score >= 80) return 'text-[#16A34A]';
  if (score >= 60) return 'text-primary';
  if (score >= 40) return 'text-[#D97706]';
  return 'text-destructive';
}

function DroppableColumn({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`flex-1 min-w-0 rounded-xl border border-border bg-card/50 p-3 transition-all duration-300 min-h-[300px] ${
        isOver ? 'border-primary/50 bg-primary/5' : ''
      }`}
    >
      {children}
    </div>
  );
}

function DraggableCard({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
  const style = {
    transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
    opacity: isDragging ? 0.4 : 1,
    cursor: 'grab',
  };
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      {children}
    </div>
  );
}

export default function Ideas() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState('');
  const [inboxType, setInboxType] = useState<InboxType>('instant');
  const [mondayMode, setMondayMode] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<InboxType>('instant');
  const recognitionRef = useRef<any>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const overdueCount = ideas.filter((i) => i.status === 'raw' && isOverdue(i.created_at)).length;

  const fetchIdeas = useCallback(async () => {
    const { data } = await supabase.from('mkt_ideas_bucket').select('*').neq('status', 'archived').order('created_at', { ascending: false });
    if (data) setIdeas(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchIdeas(); }, [fetchIdeas]);

  useEffect(() => {
    const channel = supabase.channel('ideas-bucket-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'mkt_ideas_bucket' }, (payload) => {
      const newRow = payload.new as Idea;
      const oldRow = payload.old as Idea;
      if (payload.eventType === 'INSERT') setIdeas((prev) => [newRow, ...prev.filter((i) => i.id !== newRow.id)]);
      if (payload.eventType === 'UPDATE') {
        if (newRow.status === 'archived') setIdeas((prev) => prev.filter((i) => i.id !== newRow.id));
        else setIdeas((prev) => prev.map((i) => (i.id === newRow.id ? newRow : i)));
      }
      if (payload.eventType === 'DELETE') setIdeas((prev) => prev.filter((i) => i.id !== oldRow.id));
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleCapture = async () => {
    if (!inputText.trim()) return;
    const { data, error } = await supabase.from('mkt_ideas_bucket').insert({ inbox_type: isMobile ? mobileTab : inboxType, raw_idea: inputText.trim(), status: 'raw', created_at: new Date().toISOString() }).select().single();
    if (!error && data) { setIdeas((prev) => [data, ...prev.filter((i) => i.id !== data.id)]); setInputText(''); toast({ title: 'Captured.' }); }
  };

  const handleVoice = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { toast({ title: 'Speech recognition not supported.', variant: 'destructive' }); return; }
    if (isListening && recognitionRef.current) { recognitionRef.current.stop(); setIsListening(false); return; }
    const recognition = new SpeechRecognition();
    recognition.continuous = false; recognition.interimResults = false; recognition.lang = 'en-NZ';
    recognition.onresult = (event: any) => { setInputText((prev) => (prev ? prev + ' ' + event.results[0][0].transcript : event.results[0][0].transcript)); setIsListening(false); };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition; recognition.start(); setIsListening(true);
  };

  const handleMove = async (id: string, target: InboxType) => {
    await supabase.from('mkt_ideas_bucket').update({ inbox_type: target }).eq('id', id);
    setIdeas((prev) => prev.map((i) => (i.id === id ? { ...i, inbox_type: target } : i)));
  };

  const handleArchive = async (id: string) => {
    await supabase.from('mkt_ideas_bucket').update({ status: 'archived' }).eq('id', id);
    setIdeas((prev) => prev.filter((i) => i.id !== id));
    toast({ title: 'Archived. Learnings stored.' });
  };

  const handlePressureTest = async (idea: Idea) => {
    setTestingId(idea.id);
    try {
      const { data, error } = await supabase.functions.invoke('pressure-test', {
        body: { idea_id: idea.id, raw_idea: idea.raw_idea },
      });
      if (error) throw error;
      setIdeas((prev) => prev.map((i) =>
        i.id === idea.id ? { ...i, pressure_test_score: data.score, pressure_test_summary: data.summary, status: 'processed' } : i
      ));
      toast({ title: `Pressure Test: ${data.score}/100` });
    } catch (e: any) {
      console.error('Pressure test failed:', e);
      toast({ title: 'Pressure test failed.', description: e.message || 'Try again.', variant: 'destructive' });
    } finally {
      setTestingId(null);
    }
  };

  const handleEnterPipeline = async (idea: Idea) => {
    const { error } = await supabase.from('mkt_initiatives').insert({
      title: idea.raw_idea.slice(0, 100),
      initiative_type: 'content',
      status: 'planning',
      pressure_test_score: idea.pressure_test_score,
      pressure_test_summary: idea.pressure_test_summary,
      created_at: new Date().toISOString(),
    });
    if (!error) {
      await supabase.from('mkt_ideas_bucket').update({ status: 'archived' }).eq('id', idea.id);
      setIdeas((prev) => prev.filter((i) => i.id !== idea.id));
      toast({ title: 'Initiative created! Redirecting...' });
      navigate('/initiatives');
    } else {
      toast({ title: 'Failed to create initiative.', variant: 'destructive' });
    }
  };

  const handleDragStart = (event: DragStartEvent) => { setActiveId(event.active.id as string); };
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    const cardId = active.id as string;
    const targetColumn = over.id as InboxType;
    if (!COLUMNS.find((c) => c.key === targetColumn)) return;
    const card = ideas.find((i) => i.id === cardId);
    if (card && card.inbox_type !== targetColumn) handleMove(cardId, targetColumn);
  };

  const getColumnIdeas = (type: InboxType) => ideas.filter((i) => i.inbox_type === type);
  const activeCard = activeId ? ideas.find((i) => i.id === activeId) : null;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-14 w-full rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* QUICK CAPTURE */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Drop an idea..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCapture()}
            className="flex-1 h-11 text-base"
          />
          <Button variant="ghost" size="icon" onClick={handleVoice} className={`min-h-[44px] min-w-[44px] ${isListening ? 'text-primary animate-pulse' : 'text-muted-foreground'}`}>
            {isListening ? <MicOff size={18} /> : <Mic size={18} />}
          </Button>
        </div>
        {!isMobile && (
          <Select value={inboxType} onValueChange={(v) => setInboxType(v as InboxType)}>
            <SelectTrigger className="w-40 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="instant">Instant Inbox</SelectItem>
              <SelectItem value="weekly">Weekly Inbox</SelectItem>
              <SelectItem value="parking_lot">Parking Lot</SelectItem>
            </SelectContent>
          </Select>
        )}
        <Button onClick={handleCapture} disabled={!inputText.trim()} className="w-full md:w-auto h-11 font-semibold">
          Capture
        </Button>
      </div>

      {/* HEADER + MONDAY MODE */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="font-display text-xl text-foreground">Ideas Bucket</h1>
        <div className="flex items-center gap-3">
          {mondayMode && overdueCount > 0 && (
            <span className="text-xs font-semibold text-[#D97706] bg-[#D97706]/10 px-2.5 py-1 rounded-full">
              {overdueCount} idea{overdueCount !== 1 ? 's' : ''} need processing
            </span>
          )}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Monday Mode</span>
            <Switch checked={mondayMode} onCheckedChange={setMondayMode} />
          </div>
        </div>
      </div>

      {/* MOBILE TAB BAR */}
      {isMobile && (
        <div className="flex rounded-xl border border-border overflow-hidden">
          {COLUMNS.map((col) => (
            <button
              key={col.key}
              onClick={() => setMobileTab(col.key)}
              className={`flex-1 py-2.5 text-xs font-semibold transition-all duration-300 ${
                mobileTab === col.key ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'
              }`}
            >
              {col.label.split(' ')[0]}
            </button>
          ))}
        </div>
      )}

      {/* COLUMNS */}
      {isMobile ? (
        <div className="space-y-3">
          {getColumnIdeas(mobileTab).map((idea) => (
            <IdeaCard key={idea.id} idea={idea} mondayMode={mondayMode} testingId={testingId} onMove={handleMove} onArchive={handleArchive} onPressureTest={handlePressureTest} onEnterPipeline={handleEnterPipeline} />
          ))}
          {getColumnIdeas(mobileTab).length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No ideas here yet.</p>
          )}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-3 gap-4">
            {COLUMNS.map((col) => {
              const colIdeas = getColumnIdeas(col.key);
              return (
                <DroppableColumn key={col.key} id={col.key}>
                  <h2 className="font-display text-xs uppercase tracking-widest text-muted-foreground mb-3">
                    {col.label} <span className="text-muted-foreground/60">({colIdeas.length})</span>
                  </h2>
                  <div className="space-y-3">
                    {colIdeas.map((idea) => (
                      <DraggableCard key={idea.id} id={idea.id}>
                        <IdeaCard idea={idea} mondayMode={mondayMode} testingId={testingId} onMove={handleMove} onArchive={handleArchive} onPressureTest={handlePressureTest} onEnterPipeline={handleEnterPipeline} />
                      </DraggableCard>
                    ))}
                  </div>
                </DroppableColumn>
              );
            })}
          </div>
          <DragOverlay>
            {activeCard ? (
              <div className="opacity-90 rotate-2">
                <IdeaCard idea={activeCard} mondayMode={mondayMode} testingId={null} onMove={() => {}} onArchive={() => {}} onPressureTest={() => {}} onEnterPipeline={() => {}} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

function IdeaCard({ idea, mondayMode, testingId, onMove, onArchive, onPressureTest, onEnterPipeline }: {
  idea: Idea; mondayMode: boolean; testingId: string | null;
  onMove: (id: string, target: InboxType) => void;
  onArchive: (id: string) => void;
  onPressureTest: (idea: Idea) => void;
  onEnterPipeline: (idea: Idea) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const overdue = mondayMode && idea.status === 'raw' && isOverdue(idea.created_at);
  const statusStyle = STATUS_COLORS[idea.status] || STATUS_COLORS.raw;
  const isTesting = testingId === idea.id;
  const hasScore = idea.pressure_test_score != null;
  const score = idea.pressure_test_score ?? 0;

  return (
    <Card className={`rounded-xl border border-border bg-card shadow-sm hover:shadow-md transition-all duration-300 ${overdue ? 'border-l-4 border-l-[#D97706]' : ''}`}>
      <CardContent className="p-4 space-y-3">
        {/* Idea text + menu */}
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm leading-relaxed text-foreground flex-1">{idea.raw_idea}</p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground"><MoreVertical size={14} /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onMove(idea.id, 'instant')}>Move to Instant Inbox</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onMove(idea.id, 'weekly')}>Move to Weekly Inbox</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onMove(idea.id, 'parking_lot')}>Move to Parking Lot</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onArchive(idea.id)} className="text-destructive focus:text-destructive">Archive</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Time + status */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">{timeAgo(idea.created_at)}</span>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${statusStyle.bg} ${statusStyle.text}`}>{idea.status}</span>
        </div>

        {/* Pressure Test Section */}
        {!hasScore ? (
          <Button
            onClick={() => onPressureTest(idea)}
            disabled={isTesting}
            className="w-full h-9 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {isTesting ? (
              <><Loader2 size={13} className="mr-1.5 animate-spin" /> Testing...</>
            ) : (
              <><ShieldCheck size={13} className="mr-1.5" /> Pressure Test</>
            )}
          </Button>
        ) : (
          <div className="space-y-2">
            {/* Score circle */}
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center justify-center h-8 w-8 rounded-full text-xs font-bold text-white ${scoreColor(score)}`}>
                {score}
              </span>
              <span className={`text-xs font-semibold ${scoreTextColor(score)}`}>
                {score >= 80 ? 'Strong' : score >= 60 ? 'Viable' : score >= 40 ? 'Weak' : 'Poor'}
              </span>
            </div>

            {/* Summary */}
            {idea.pressure_test_summary && (
              <div>
                <p className={`text-xs text-muted-foreground leading-relaxed ${!expanded ? 'line-clamp-2' : ''}`}>
                  {idea.pressure_test_summary}
                </p>
                <button onClick={() => setExpanded(!expanded)} className="text-[11px] text-primary font-medium mt-0.5 flex items-center gap-0.5">
                  {expanded ? <><ChevronUp size={12} /> Less</> : <><ChevronDown size={12} /> More</>}
                </button>
              </div>
            )}

            {/* Post-score actions */}
            {score >= 60 ? (
              <Button
                onClick={() => onEnterPipeline(idea)}
                className="w-full h-9 text-xs font-semibold bg-[#16A34A] hover:bg-[#16A34A]/90 text-white"
              >
                <Rocket size={13} className="mr-1.5" /> Enter Pipeline
              </Button>
            ) : (
              <Button
                onClick={() => onArchive(idea.id)}
                className="w-full h-9 text-xs font-semibold bg-[#D97706] hover:bg-[#D97706]/90 text-white"
              >
                <Archive size={13} className="mr-1.5" /> Archive with Learnings
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
