import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Mic, MicOff, MoreVertical, Loader2, ShieldCheck, Archive, Rocket, ChevronDown, ChevronUp, Send, Tag, Filter, Sparkles, Megaphone, Cog, Users, Package } from 'lucide-react';
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
  category?: string | null;
}

type InboxType = 'instant' | 'weekly' | 'parking_lot';

const COLUMNS: { key: InboxType; label: string }[] = [
  { key: 'instant', label: 'INSTANT INBOX' },
  { key: 'weekly', label: 'WEEKLY INBOX' },
  { key: 'parking_lot', label: 'PARKING LOT' },
];

const CATEGORIES = [
  { key: 'marketing', label: 'Marketing', icon: Megaphone, color: 'bg-primary/10 text-primary border-primary/20' },
  { key: 'operations', label: 'Operations', icon: Cog, color: 'bg-orange/10 text-orange border-orange/20' },
  { key: 'customer_experience', label: 'Customer XP', icon: Users, color: 'bg-success/10 text-success border-success/20' },
  { key: 'product', label: 'Product', icon: Package, color: 'bg-secondary/10 text-secondary border-secondary/20' },
] as const;

type CategoryKey = typeof CATEGORIES[number]['key'] | null;

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  raw: { bg: 'bg-border', text: 'text-muted-foreground' },
  processed: { bg: 'bg-success/10', text: 'text-success' },
  parked: { bg: 'bg-orange/10', text: 'text-orange' },
};

function getCategoryConfig(key: string | null | undefined) {
  return CATEGORIES.find((c) => c.key === key) || null;
}

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
  if (score >= 80) return 'bg-success';
  if (score >= 60) return 'bg-primary';
  if (score >= 40) return 'bg-orange';
  return 'bg-destructive';
}

function scoreTextColor(score: number) {
  if (score >= 80) return 'text-success';
  if (score >= 60) return 'text-primary';
  if (score >= 40) return 'text-orange';
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
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey>(null);
  const [filterCategory, setFilterCategory] = useState<CategoryKey | 'all'>('all');
  const [mondayMode, setMondayMode] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<InboxType>('instant');
  const [captureExpanded, setCaptureExpanded] = useState(false);
  const recognitionRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const filteredIdeas = filterCategory === 'all' ? ideas : ideas.filter((i) => i.category === filterCategory);
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
    const insertData: any = {
      inbox_type: isMobile ? mobileTab : 'instant',
      raw_idea: inputText.trim(),
      status: 'raw',
      created_at: new Date().toISOString(),
    };
    if (selectedCategory) insertData.category = selectedCategory;

    const { data, error } = await supabase.from('mkt_ideas_bucket').insert(insertData).select().single();
    if (!error && data) {
      setIdeas((prev) => [data, ...prev.filter((i) => i.id !== data.id)]);
      setInputText('');
      setSelectedCategory(null);
      setCaptureExpanded(false);
      toast({ title: 'Idea captured ✓' });
    }
  };

  const handleVoice = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { toast({ title: 'Speech recognition not supported.', variant: 'destructive' }); return; }
    if (isListening && recognitionRef.current) { recognitionRef.current.stop(); setIsListening(false); return; }
    const recognition = new SpeechRecognition();
    recognition.continuous = false; recognition.interimResults = false; recognition.lang = 'en-NZ';
    recognition.onresult = (event: any) => {
      setInputText((prev) => (prev ? prev + ' ' + event.results[0][0].transcript : event.results[0][0].transcript));
      setIsListening(false);
      setCaptureExpanded(true);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition; recognition.start(); setIsListening(true);
  };

  const handleMove = async (id: string, target: InboxType) => {
    await supabase.from('mkt_ideas_bucket').update({ inbox_type: target }).eq('id', id);
    setIdeas((prev) => prev.map((i) => (i.id === id ? { ...i, inbox_type: target } : i)));
  };

  const handleSetCategory = async (id: string, category: string) => {
    await supabase.from('mkt_ideas_bucket').update({ category }).eq('id', id);
    setIdeas((prev) => prev.map((i) => (i.id === id ? { ...i, category } : i)));
    toast({ title: `Tagged: ${getCategoryConfig(category)?.label}` });
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

  const getColumnIdeas = (type: InboxType) => filteredIdeas.filter((i) => i.inbox_type === type);
  const activeCard = activeId ? ideas.find((i) => i.id === activeId) : null;

  // Category counts for filter bar
  const categoryCounts = {
    all: ideas.length,
    marketing: ideas.filter((i) => i.category === 'marketing').length,
    operations: ideas.filter((i) => i.category === 'operations').length,
    customer_experience: ideas.filter((i) => i.category === 'customer_experience').length,
    product: ideas.filter((i) => i.category === 'product').length,
    uncategorised: ideas.filter((i) => !i.category).length,
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* QUICK CAPTURE — redesigned */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="p-4 space-y-3">
          {/* Main input row */}
          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              <Textarea
                ref={textareaRef}
                placeholder="What's the idea? Tap mic or type..."
                value={inputText}
                onChange={(e) => {
                  setInputText(e.target.value);
                  if (e.target.value.trim() && !captureExpanded) setCaptureExpanded(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCapture(); }
                }}
                onFocus={() => setCaptureExpanded(true)}
                rows={captureExpanded ? 3 : 1}
                className="resize-none text-base transition-all duration-200 pr-12"
              />
              {/* Voice button overlaid */}
              <Button
                variant="ghost"
                size="icon"
                onClick={handleVoice}
                className={`absolute right-1.5 bottom-1.5 h-9 w-9 rounded-lg ${
                  isListening ? 'text-destructive bg-destructive/10 animate-pulse' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {isListening ? <MicOff size={18} /> : <Mic size={18} />}
              </Button>
            </div>
            <Button
              onClick={handleCapture}
              disabled={!inputText.trim()}
              size="icon"
              className="h-11 w-11 shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <Send size={18} />
            </Button>
          </div>

          {/* Category chips — shown when expanded */}
          {captureExpanded && (
            <div className="flex items-center gap-2 flex-wrap animate-in fade-in slide-in-from-top-1 duration-200">
              <Tag size={14} className="text-muted-foreground shrink-0" />
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const isActive = selectedCategory === cat.key;
                return (
                  <button
                    key={cat.key}
                    onClick={() => setSelectedCategory(isActive ? null : cat.key)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-all duration-200 ${
                      isActive ? cat.color + ' ring-1 ring-offset-1' : 'bg-card text-muted-foreground border-border hover:border-foreground/20'
                    }`}
                  >
                    <Icon size={12} />
                    {cat.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Listening indicator */}
        {isListening && (
          <div className="px-4 pb-3 flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-destructive" />
            </span>
            <span className="text-xs text-destructive font-medium">Listening...</span>
          </div>
        )}
      </div>

      {/* HEADER + FILTERS */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-xl text-foreground">Ideas Bucket</h1>
          <span className="text-xs text-muted-foreground bg-border/50 px-2 py-0.5 rounded-full">{ideas.length}</span>
        </div>
        <div className="flex items-center gap-3">
          {mondayMode && overdueCount > 0 && (
            <span className="text-xs font-semibold text-orange bg-orange/10 px-2.5 py-1 rounded-full">
              {overdueCount} need processing
            </span>
          )}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Monday Mode</span>
            <Switch checked={mondayMode} onCheckedChange={setMondayMode} />
          </div>
        </div>
      </div>

      {/* CATEGORY FILTER BAR */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <Filter size={14} className="text-muted-foreground shrink-0" />
        <button
          onClick={() => setFilterCategory('all')}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium border transition-all duration-200 ${
            filterCategory === 'all' ? 'bg-foreground text-background border-foreground' : 'bg-card text-muted-foreground border-border hover:border-foreground/20'
          }`}
        >
          All ({categoryCounts.all})
        </button>
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const count = categoryCounts[cat.key];
          return (
            <button
              key={cat.key}
              onClick={() => setFilterCategory(filterCategory === cat.key ? 'all' : cat.key)}
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-all duration-200 ${
                filterCategory === cat.key ? cat.color + ' ring-1 ring-offset-1' : 'bg-card text-muted-foreground border-border hover:border-foreground/20'
              }`}
            >
              <Icon size={12} />
              {cat.label} ({count})
            </button>
          );
        })}
        {categoryCounts.uncategorised > 0 && (
          <button
            onClick={() => setFilterCategory(filterCategory === null ? 'all' : null)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium border transition-all duration-200 ${
              filterCategory === null ? 'bg-muted-foreground/10 text-foreground border-muted-foreground/30' : 'bg-card text-muted-foreground border-border hover:border-foreground/20'
            }`}
          >
            Uncategorised ({categoryCounts.uncategorised})
          </button>
        )}
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
            <IdeaCard key={idea.id} idea={idea} mondayMode={mondayMode} testingId={testingId} onMove={handleMove} onArchive={handleArchive} onPressureTest={handlePressureTest} onEnterPipeline={handleEnterPipeline} onSetCategory={handleSetCategory} />
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
                        <IdeaCard idea={idea} mondayMode={mondayMode} testingId={testingId} onMove={handleMove} onArchive={handleArchive} onPressureTest={handlePressureTest} onEnterPipeline={handleEnterPipeline} onSetCategory={handleSetCategory} />
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
                <IdeaCard idea={activeCard} mondayMode={mondayMode} testingId={null} onMove={() => {}} onArchive={() => {}} onPressureTest={() => {}} onEnterPipeline={() => {}} onSetCategory={() => {}} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

/* ─── IDEA CARD ─── */

function IdeaCard({ idea, mondayMode, testingId, onMove, onArchive, onPressureTest, onEnterPipeline, onSetCategory }: {
  idea: Idea; mondayMode: boolean; testingId: string | null;
  onMove: (id: string, target: InboxType) => void;
  onArchive: (id: string) => void;
  onPressureTest: (idea: Idea) => void;
  onEnterPipeline: (idea: Idea) => void;
  onSetCategory: (id: string, category: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const overdue = mondayMode && idea.status === 'raw' && isOverdue(idea.created_at);
  const statusStyle = STATUS_COLORS[idea.status] || STATUS_COLORS.raw;
  const isTesting = testingId === idea.id;
  const hasScore = idea.pressure_test_score != null;
  const score = idea.pressure_test_score ?? 0;
  const catConfig = getCategoryConfig(idea.category);

  return (
    <Card className={`rounded-xl border border-border bg-card shadow-sm hover:shadow-md transition-all duration-300 ${overdue ? 'border-l-4 border-l-orange' : ''}`}>
      <CardContent className="p-4 space-y-3">
        {/* Category tag + menu */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 space-y-2">
            {catConfig && (
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border ${catConfig.color}`}>
                <catConfig.icon size={10} />
                {catConfig.label}
              </span>
            )}
            <p className="text-sm leading-relaxed text-foreground">{idea.raw_idea}</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground"><MoreVertical size={14} /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled className="text-xs text-muted-foreground font-semibold">Move to...</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onMove(idea.id, 'instant')}>Instant Inbox</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onMove(idea.id, 'weekly')}>Weekly Inbox</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onMove(idea.id, 'parking_lot')}>Parking Lot</DropdownMenuItem>
              <DropdownMenuItem disabled className="text-xs text-muted-foreground font-semibold mt-1">Tag as...</DropdownMenuItem>
              {CATEGORIES.map((cat) => (
                <DropdownMenuItem key={cat.key} onClick={() => onSetCategory(idea.id, cat.key)}>
                  <cat.icon size={12} className="mr-1.5" />{cat.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onClick={() => onArchive(idea.id)} className="text-destructive focus:text-destructive mt-1">Archive</DropdownMenuItem>
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
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center justify-center h-8 w-8 rounded-full text-xs font-bold text-primary-foreground ${scoreColor(score)}`}>
                {score}
              </span>
              <span className={`text-xs font-semibold ${scoreTextColor(score)}`}>
                {score >= 80 ? 'Strong' : score >= 60 ? 'Viable' : score >= 40 ? 'Weak' : 'Poor'}
              </span>
            </div>

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

            {score >= 60 ? (
              <Button onClick={() => onEnterPipeline(idea)} className="w-full h-9 text-xs font-semibold bg-success hover:bg-success/90 text-primary-foreground">
                <Rocket size={13} className="mr-1.5" /> Enter Pipeline
              </Button>
            ) : (
              <Button onClick={() => onArchive(idea.id)} className="w-full h-9 text-xs font-semibold bg-orange hover:bg-orange/90 text-primary-foreground">
                <Archive size={13} className="mr-1.5" /> Archive with Learnings
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
