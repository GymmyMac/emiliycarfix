import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Mic, MicOff, MoreVertical, Loader2, Plus, Filter,
  Code2, Cog, TrendingUp, ArrowRight, Link2, MessageSquare,
  ChevronDown, ChevronUp, AlertCircle,
} from 'lucide-react';
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

/* ─── TYPES ─── */

interface Idea {
  id: string;
  title: string;
  category: 'development' | 'operations' | 'marketing_growth';
  description: string | null;
  priority: 'low' | 'medium' | 'high';
  status: 'raw' | 'reviewing' | 'actioned' | 'parked';
  submitted_by: string | null;
  submitted_by_email: string | null;
  created_at: string;
  updated_at: string;
  pressure_test_score?: number | null;
  pressure_test_summary?: string | null;
}

interface IdeaNote {
  id: string;
  note: string;
  user_email: string | null;
  created_at: string;
}

interface IdeaLink {
  id: string;
  title: string | null;
  similarity_score: number | null;
  link_type: string;
}

type StatusKey = Idea['status'];
type CategoryKey = Idea['category'];
type PriorityKey = Idea['priority'];

/* ─── CONSTANTS ─── */

const STATUSES: { key: StatusKey; label: string }[] = [
  { key: 'raw', label: 'Raw' },
  { key: 'reviewing', label: 'Reviewing' },
  { key: 'actioned', label: 'Actioned' },
  { key: 'parked', label: 'Parked' },
];

const CATEGORIES: { key: CategoryKey; label: string; icon: typeof Code2 }[] = [
  { key: 'development', label: 'Development', icon: Code2 },
  { key: 'operations', label: 'Operations', icon: Cog },
  { key: 'marketing_growth', label: 'Marketing & Growth', icon: TrendingUp },
];

const PRIORITIES: { key: PriorityKey; label: string; color: string }[] = [
  { key: 'high', label: 'High', color: 'bg-destructive/10 text-destructive border-destructive/20' },
  { key: 'medium', label: 'Medium', color: 'bg-orange/10 text-orange border-orange/20' },
  { key: 'low', label: 'Low', color: 'bg-muted text-muted-foreground border-border' },
];

function getCategoryConfig(key: string) {
  return CATEGORIES.find((c) => c.key === key);
}
function getPriorityConfig(key: string) {
  return PRIORITIES.find((p) => p.key === key);
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

/* ─── DnD HELPERS ─── */

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

/* ─── MAIN COMPONENT ─── */

export default function Ideas() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCaptureForm, setShowCaptureForm] = useState(false);
  const [filterCategory, setFilterCategory] = useState<CategoryKey | 'all'>('all');
  const [filterPriority, setFilterPriority] = useState<PriorityKey | 'all'>('all');
  const [mobileTab, setMobileTab] = useState<StatusKey>('raw');
  const [activeId, setActiveId] = useState<string | null>(null);

  // Capture form state
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState<CategoryKey>('development');
  const [formDescription, setFormDescription] = useState('');
  const [formPriority, setFormPriority] = useState<PriorityKey>('medium');
  const [submitting, setSubmitting] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Status move dialog
  const [moveDialogIdea, setMoveDialogIdea] = useState<Idea | null>(null);
  const [moveTarget, setMoveTarget] = useState<StatusKey>('raw');
  const [moveNote, setMoveNote] = useState('');
  const [moving, setMoving] = useState(false);

  // Related context
  const [relatedLinks, setRelatedLinks] = useState<Record<string, IdeaLink[]>>({});
  const [ideaNotes, setIdeaNotes] = useState<Record<string, IdeaNote[]>>({});

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const filteredIdeas = ideas.filter((i) => {
    if (filterCategory !== 'all' && i.category !== filterCategory) return false;
    if (filterPriority !== 'all' && i.priority !== filterPriority) return false;
    return true;
  });

  /* ─── DATA FETCHING ─── */

  const fetchIdeas = useCallback(async () => {
    const { data } = await supabase
      .from('mkt_ideas')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setIdeas(data);
    setLoading(false);
  }, []);

  const fetchLinksForIdea = async (ideaId: string) => {
    const { data } = await supabase
      .from('mkt_idea_links')
      .select('id, title, similarity_score, link_type')
      .eq('idea_id', ideaId);
    if (data) setRelatedLinks((prev) => ({ ...prev, [ideaId]: data }));
  };

  const fetchNotesForIdea = async (ideaId: string) => {
    const { data } = await supabase
      .from('mkt_idea_notes')
      .select('id, note, user_email, created_at')
      .eq('idea_id', ideaId)
      .order('created_at', { ascending: true });
    if (data) setIdeaNotes((prev) => ({ ...prev, [ideaId]: data }));
  };

  useEffect(() => { fetchIdeas(); }, [fetchIdeas]);

  useEffect(() => {
    const channel = supabase
      .channel('mkt-ideas-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mkt_ideas' }, () => {
        fetchIdeas();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchIdeas]);

  // Fetch links for all ideas on load
  useEffect(() => {
    ideas.forEach((idea) => {
      if (!relatedLinks[idea.id]) fetchLinksForIdea(idea.id);
    });
  }, [ideas]);

  /* ─── CAPTURE ─── */

  const handleCapture = async () => {
    if (!formTitle.trim()) return;
    setSubmitting(true);

    const insertData = {
      title: formTitle.trim(),
      category: formCategory,
      description: formDescription.trim() || null,
      priority: formPriority,
      status: 'raw' as const,
      submitted_by: user?.id || null,
      submitted_by_email: user?.email || null,
    };

    const { data, error } = await supabase.from('mkt_ideas').insert(insertData).select().single();
    if (error) {
      toast({ title: 'Failed to save idea', description: error.message, variant: 'destructive' });
      setSubmitting(false);
      return;
    }

    // Embed in Emily's vector brain (async, non-blocking)
    supabase.functions.invoke('idea-embed', {
      body: {
        idea_id: data.id,
        title: data.title,
        description: data.description,
        category: data.category,
        priority: data.priority,
        submitted_by_email: data.submitted_by_email,
      },
    }).then(({ data: embedData }) => {
      if (embedData?.related_count > 0) {
        fetchLinksForIdea(data.id);
        toast({
          title: `Emily found ${embedData.related_count} related item${embedData.related_count > 1 ? 's' : ''}`,
          description: 'Check the idea card for context links.',
        });
      }
    }).catch((e) => console.error('Embedding failed (non-blocking):', e));

    setIdeas((prev) => [data, ...prev]);
    setFormTitle('');
    setFormDescription('');
    setFormPriority('medium');
    setFormCategory('development');
    setShowCaptureForm(false);
    setSubmitting(false);
    toast({ title: 'Idea captured ✓' });
  };

  /* ─── VOICE ─── */

  const handleVoice = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { toast({ title: 'Speech recognition not supported.', variant: 'destructive' }); return; }
    if (isListening && recognitionRef.current) { recognitionRef.current.stop(); setIsListening(false); return; }
    const recognition = new SpeechRecognition();
    recognition.continuous = false; recognition.interimResults = false; recognition.lang = 'en-NZ';
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      if (!showCaptureForm) {
        setShowCaptureForm(true);
        setFormTitle(transcript);
      } else {
        setFormTitle((prev) => prev ? prev + ' ' + transcript : transcript);
      }
      setIsListening(false);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition; recognition.start(); setIsListening(true);
  };

  /* ─── STATUS MOVE WITH NOTE ─── */

  const openMoveDialog = (idea: Idea, target: StatusKey) => {
    setMoveDialogIdea(idea);
    setMoveTarget(target);
    setMoveNote('');
  };

  const confirmMove = async () => {
    if (!moveDialogIdea) return;
    setMoving(true);

    await supabase.from('mkt_ideas').update({ status: moveTarget }).eq('id', moveDialogIdea.id);

    if (moveNote.trim()) {
      await supabase.from('mkt_idea_notes').insert({
        idea_id: moveDialogIdea.id,
        note: moveNote.trim(),
        user_id: user?.id || null,
        user_email: user?.email || null,
      });
    }

    setIdeas((prev) => prev.map((i) => (i.id === moveDialogIdea.id ? { ...i, status: moveTarget } : i)));
    toast({ title: `Moved to ${STATUSES.find((s) => s.key === moveTarget)?.label}` });
    setMoveDialogIdea(null);
    setMoveNote('');
    setMoving(false);
  };

  /* ─── DRAG & DROP ─── */

  const handleDragStart = (event: DragStartEvent) => { setActiveId(event.active.id as string); };
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    const cardId = active.id as string;
    const targetColumn = over.id as StatusKey;
    if (!STATUSES.find((s) => s.key === targetColumn)) return;
    const card = ideas.find((i) => i.id === cardId);
    if (card && card.status !== targetColumn) {
      openMoveDialog(card, targetColumn);
    }
  };

  const getColumnIdeas = (status: StatusKey) => filteredIdeas.filter((i) => i.status === status);
  const activeCard = activeId ? ideas.find((i) => i.id === activeId) : null;

  /* ─── RENDER ─── */

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-14 w-full rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-xl text-foreground">Ideas</h1>
          <span className="text-xs text-muted-foreground bg-border/50 px-2 py-0.5 rounded-full">{ideas.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleVoice}
            className={`h-9 w-9 ${isListening ? 'text-destructive bg-destructive/10 animate-pulse' : 'text-muted-foreground'}`}
          >
            {isListening ? <MicOff size={18} /> : <Mic size={18} />}
          </Button>
          <Button onClick={() => setShowCaptureForm(true)} className="h-9 gap-1.5 bg-primary text-primary-foreground">
            <Plus size={16} /> New Idea
          </Button>
        </div>
      </div>

      {/* LISTENING INDICATOR */}
      {isListening && (
        <div className="flex items-center gap-2 px-1">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-destructive" />
          </span>
          <span className="text-xs text-destructive font-medium">Listening...</span>
        </div>
      )}

      {/* FILTERS */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <Filter size={14} className="text-muted-foreground shrink-0" />
        <Select value={filterCategory} onValueChange={(v) => setFilterCategory(v as any)}>
          <SelectTrigger className="h-8 w-auto min-w-[120px] text-xs">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterPriority} onValueChange={(v) => setFilterPriority(v as any)}>
          <SelectTrigger className="h-8 w-auto min-w-[100px] text-xs">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            {PRIORITIES.map((p) => (
              <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* MOBILE TAB BAR */}
      {isMobile && (
        <div className="flex rounded-xl border border-border overflow-hidden">
          {STATUSES.map((col) => {
            const count = getColumnIdeas(col.key).length;
            return (
              <button
                key={col.key}
                onClick={() => setMobileTab(col.key)}
                className={`flex-1 py-2.5 text-xs font-semibold transition-all duration-300 ${
                  mobileTab === col.key ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'
                }`}
              >
                {col.label} {count > 0 && <span className="opacity-70">({count})</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* KANBAN COLUMNS */}
      {isMobile ? (
        <div className="space-y-3">
          {getColumnIdeas(mobileTab).map((idea) => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              links={relatedLinks[idea.id]}
              notes={ideaNotes[idea.id]}
              onOpenMove={openMoveDialog}
              onFetchNotes={fetchNotesForIdea}
            />
          ))}
          {getColumnIdeas(mobileTab).length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No ideas in this column.</p>
          )}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-4 gap-3">
            {STATUSES.map((col) => {
              const colIdeas = getColumnIdeas(col.key);
              return (
                <DroppableColumn key={col.key} id={col.key}>
                  <h2 className="font-display text-xs uppercase tracking-widest text-muted-foreground mb-3">
                    {col.label} <span className="text-muted-foreground/60">({colIdeas.length})</span>
                  </h2>
                  <div className="space-y-3">
                    {colIdeas.map((idea) => (
                      <DraggableCard key={idea.id} id={idea.id}>
                        <IdeaCard
                          idea={idea}
                          links={relatedLinks[idea.id]}
                          notes={ideaNotes[idea.id]}
                          onOpenMove={openMoveDialog}
                          onFetchNotes={fetchNotesForIdea}
                        />
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
                <IdeaCard idea={activeCard} links={relatedLinks[activeCard.id]} notes={undefined} onOpenMove={() => {}} onFetchNotes={() => {}} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* CAPTURE FORM DIALOG */}
      <Dialog open={showCaptureForm} onOpenChange={setShowCaptureForm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Capture Idea</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Title *</label>
              <Input
                placeholder="Short idea title..."
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCapture(); } }}
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Category</label>
              <Select value={formCategory} onValueChange={(v) => setFormCategory(v as CategoryKey)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Description <span className="text-muted-foreground/60">(optional, max 500)</span>
              </label>
              <Textarea
                placeholder="More detail if needed..."
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value.slice(0, 500))}
                rows={3}
                className="resize-none"
              />
              <span className="text-[10px] text-muted-foreground mt-1 block text-right">{formDescription.length}/500</span>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Priority</label>
              <div className="flex gap-2">
                {PRIORITIES.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setFormPriority(p.key)}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-all ${
                      formPriority === p.key ? p.color + ' ring-1 ring-offset-1' : 'bg-card text-muted-foreground border-border'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              Submitted by: <span className="text-foreground font-medium">{user?.email || 'Unknown'}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCaptureForm(false)}>Cancel</Button>
            <Button onClick={handleCapture} disabled={!formTitle.trim() || submitting} className="bg-primary text-primary-foreground">
              {submitting ? <><Loader2 size={14} className="mr-1.5 animate-spin" /> Saving...</> : 'Save Idea'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MOVE STATUS DIALOG */}
      <Dialog open={!!moveDialogIdea} onOpenChange={(open) => { if (!open) setMoveDialogIdea(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-base">
              Move to {STATUSES.find((s) => s.key === moveTarget)?.label}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              "{moveDialogIdea?.title}"
            </p>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Add a note (optional)</label>
              <Textarea
                placeholder="Why is this moving? Any context..."
                value={moveNote}
                onChange={(e) => setMoveNote(e.target.value)}
                rows={2}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveDialogIdea(null)}>Cancel</Button>
            <Button onClick={confirmMove} disabled={moving} className="bg-primary text-primary-foreground">
              {moving ? <Loader2 size={14} className="animate-spin" /> : 'Move'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── IDEA CARD ─── */

function IdeaCard({ idea, links, notes, onOpenMove, onFetchNotes }: {
  idea: Idea;
  links?: IdeaLink[];
  notes?: IdeaNote[];
  onOpenMove: (idea: Idea, target: StatusKey) => void;
  onFetchNotes: (ideaId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const catConfig = getCategoryConfig(idea.category);
  const prioConfig = getPriorityConfig(idea.priority);
  const CatIcon = catConfig?.icon || Code2;
  const hasLinks = links && links.length > 0;

  const handleToggleNotes = () => {
    if (!showNotes && !notes) onFetchNotes(idea.id);
    setShowNotes(!showNotes);
  };

  return (
    <Card className="rounded-xl border border-border bg-card shadow-sm hover:shadow-md transition-all duration-300">
      <CardContent className="p-3 space-y-2">
        {/* Top row: category + priority + menu */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {catConfig && (
              <Badge variant="outline" className="text-[10px] gap-1 px-2 py-0.5 font-semibold">
                <CatIcon size={10} />
                {catConfig.label}
              </Badge>
            )}
            {prioConfig && (
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border ${prioConfig.color}`}>
                {prioConfig.label}
              </span>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground">
                <MoreVertical size={14} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled className="text-xs text-muted-foreground font-semibold">Move to...</DropdownMenuItem>
              {STATUSES.filter((s) => s.key !== idea.status).map((s) => (
                <DropdownMenuItem key={s.key} onClick={() => onOpenMove(idea, s.key)}>
                  <ArrowRight size={12} className="mr-1.5" />{s.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Title */}
        <p className="text-sm font-semibold leading-snug text-foreground">{idea.title}</p>

        {/* Description */}
        {idea.description && (
          <p className={`text-xs text-muted-foreground leading-relaxed ${!expanded ? 'line-clamp-2' : ''}`}>
            {idea.description}
          </p>
        )}
        {idea.description && idea.description.length > 100 && (
          <button onClick={() => setExpanded(!expanded)} className="text-[11px] text-primary font-medium flex items-center gap-0.5">
            {expanded ? <><ChevronUp size={12} /> Less</> : <><ChevronDown size={12} /> More</>}
          </button>
        )}

        {/* Emily's Related Context */}
        {hasLinks && (
          <div className="rounded-lg bg-secondary/10 border border-secondary/20 px-3 py-2 space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-secondary">
              <Link2 size={12} />
              Emily linked {links.length} related item{links.length > 1 ? 's' : ''}
            </div>
            {links.slice(0, 3).map((link) => (
              <p key={link.id} className="text-[10px] text-muted-foreground truncate">
                • {link.title} {link.similarity_score && <span className="text-muted-foreground/60">({(link.similarity_score * 100).toFixed(0)}%)</span>}
              </p>
            ))}
          </div>
        )}

        {/* Footer: submitter, time, notes toggle */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">{idea.submitted_by_email?.split('@')[0] || 'Unknown'}</span>
            <span className="text-[10px] text-muted-foreground">•</span>
            <span className="text-[10px] text-muted-foreground">{timeAgo(idea.created_at)}</span>
          </div>
          <button onClick={handleToggleNotes} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
            <MessageSquare size={10} />
            Notes
          </button>
        </div>

        {/* Notes section */}
        {showNotes && (
          <div className="border-t border-border pt-2 mt-1 space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
            {notes && notes.length > 0 ? notes.map((n) => (
              <div key={n.id} className="text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">{n.user_email?.split('@')[0] || 'System'}:</span> {n.note}
                <span className="text-muted-foreground/50 ml-1">{timeAgo(n.created_at)}</span>
              </div>
            )) : (
              <p className="text-[11px] text-muted-foreground italic">No notes yet. Notes are added when moving status.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
