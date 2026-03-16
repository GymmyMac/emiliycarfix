import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import { Mic, MicOff, MoreVertical, Loader2, Sparkles } from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { useDroppable } from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

interface Idea {
  id: string;
  inbox_type: string;
  raw_idea: string;
  status: string;
  created_at: string;
}

type InboxType = 'instant' | 'weekly' | 'parking_lot';

const COLUMNS: { key: InboxType; label: string }[] = [
  { key: 'instant', label: 'INSTANT INBOX' },
  { key: 'weekly', label: 'WEEKLY INBOX' },
  { key: 'parking_lot', label: 'PARKING LOT' },
];

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  raw: { bg: 'bg-muted', text: 'text-muted-foreground' },
  processed: { bg: 'bg-[#1A7A40]/20', text: 'text-[#1A7A40]' },
  parked: { bg: 'bg-[#7A5500]/20', text: 'text-[#7A5500]' },
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

// Droppable column wrapper
function DroppableColumn({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`flex-1 min-w-0 rounded-lg border border-border bg-card/30 p-3 transition-colors min-h-[300px] ${
        isOver ? 'border-primary/50 bg-primary/5' : ''
      }`}
    >
      {children}
    </div>
  );
}

// Draggable card wrapper
function DraggableCard({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
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
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState('');
  const [inboxType, setInboxType] = useState<InboxType>('instant');
  const [mondayMode, setMondayMode] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const fetchIdeas = useCallback(async () => {
    const { data, error } = await supabase
      .from('mkt_ideas_bucket')
      .select('*')
      .neq('status', 'archived')
      .order('created_at', { ascending: false });

    if (data) setIdeas(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchIdeas();
  }, [fetchIdeas]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('ideas-bucket-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mkt_ideas_bucket' },
        (payload) => {
          const newRow = payload.new as Idea;
          const oldRow = payload.old as Idea;

          if (payload.eventType === 'INSERT') {
            setIdeas((prev) => [newRow, ...prev.filter((i) => i.id !== newRow.id)]);
          }
          if (payload.eventType === 'UPDATE') {
            if (newRow.status === 'archived') {
              setIdeas((prev) => prev.filter((i) => i.id !== newRow.id));
            } else {
              setIdeas((prev) =>
                prev.map((i) => (i.id === newRow.id ? newRow : i))
              );
            }
          }
          if (payload.eventType === 'DELETE') {
            setIdeas((prev) => prev.filter((i) => i.id !== oldRow.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleCapture = async () => {
    if (!inputText.trim()) return;
    const now = new Date().toISOString();
    const newIdea = {
      inbox_type: inboxType,
      raw_idea: inputText.trim(),
      status: 'raw',
      created_at: now,
    };

    const { data, error } = await supabase
      .from('mkt_ideas_bucket')
      .insert(newIdea)
      .select()
      .single();

    if (!error && data) {
      // Optimistically add to state so it appears instantly
      setIdeas((prev) => [data, ...prev.filter((i) => i.id !== data.id)]);
      setInputText('');
      toast({
        title: 'Captured.',
        className: 'border-[#1A7A40] bg-[#1A7A40]/20 text-foreground',
      });
    }
  };

  const handleVoice = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({ title: 'Speech recognition not supported in this browser.', variant: 'destructive' });
      return;
    }

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-NZ';

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInputText((prev) => (prev ? prev + ' ' + transcript : transcript));
      setIsListening(false);
    };

    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  const handleMove = async (id: string, target: InboxType) => {
    await supabase
      .from('mkt_ideas_bucket')
      .update({ inbox_type: target })
      .eq('id', id);

    setIdeas((prev) =>
      prev.map((i) => (i.id === id ? { ...i, inbox_type: target } : i))
    );
  };

  const handleArchive = async (id: string) => {
    await supabase
      .from('mkt_ideas_bucket')
      .update({ status: 'archived' })
      .eq('id', id);

    setIdeas((prev) => prev.filter((i) => i.id !== id));
  };

  const handleProcessEmily = (id: string) => {
    setProcessingId(id);
    setTimeout(() => setProcessingId(null), 1000);
  };

  // DnD handlers
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const cardId = active.id as string;
    const targetColumn = over.id as InboxType;

    if (!COLUMNS.find((c) => c.key === targetColumn)) return;

    const card = ideas.find((i) => i.id === cardId);
    if (card && card.inbox_type !== targetColumn) {
      handleMove(cardId, targetColumn);
    }
  };

  const getColumnIdeas = (inboxType: InboxType) =>
    ideas.filter((i) => i.inbox_type === inboxType);

  const activeCard = activeId ? ideas.find((i) => i.id === activeId) : null;

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-14 w-full rounded-lg" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* QUICK CAPTURE BAR */}
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <div className="flex-1 flex items-center gap-2">
          <Input
            placeholder="Drop an idea..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCapture()}
            className="bg-accent border-border"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={handleVoice}
            className={isListening ? 'text-primary animate-pulse' : 'text-muted-foreground'}
          >
            {isListening ? <MicOff size={18} /> : <Mic size={18} />}
          </Button>
        </div>
        <Select value={inboxType} onValueChange={(v) => setInboxType(v as InboxType)}>
          <SelectTrigger className="w-40 bg-accent border-border text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="instant">Instant Inbox</SelectItem>
            <SelectItem value="weekly">Weekly Inbox</SelectItem>
            <SelectItem value="parking_lot">Parking Lot</SelectItem>
          </SelectContent>
        </Select>
        <Button
          onClick={handleCapture}
          disabled={!inputText.trim()}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          Capture
        </Button>
      </div>

      {/* MONDAY MODE + PAGE HEADER */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Ideas Bucket</h1>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Monday Mode</span>
          <Switch checked={mondayMode} onCheckedChange={setMondayMode} />
        </div>
      </div>

      {/* THREE COLUMNS */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-3 gap-4">
          {COLUMNS.map((col) => {
            const colIdeas = getColumnIdeas(col.key);
            return (
              <DroppableColumn key={col.key} id={col.key}>
                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                  {col.label}{' '}
                  <span className="text-muted-foreground/60">({colIdeas.length})</span>
                </h2>
                <div className="space-y-3">
                  {colIdeas.map((idea) => (
                    <DraggableCard key={idea.id} id={idea.id}>
                      <IdeaCard
                        idea={idea}
                        mondayMode={mondayMode}
                        processingId={processingId}
                        onMove={handleMove}
                        onArchive={handleArchive}
                        onProcess={handleProcessEmily}
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
              <IdeaCard
                idea={activeCard}
                mondayMode={mondayMode}
                processingId={null}
                onMove={() => {}}
                onArchive={() => {}}
                onProcess={() => {}}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function IdeaCard({
  idea,
  mondayMode,
  processingId,
  onMove,
  onArchive,
  onProcess,
}: {
  idea: Idea;
  mondayMode: boolean;
  processingId: string | null;
  onMove: (id: string, target: InboxType) => void;
  onArchive: (id: string) => void;
  onProcess: (id: string) => void;
}) {
  const overdue = mondayMode && idea.status === 'raw' && isOverdue(idea.created_at);
  const statusStyle = STATUS_COLORS[idea.status] || STATUS_COLORS.raw;
  const isProcessing = processingId === idea.id;

  return (
    <Card
      className={`border-border bg-card transition-all ${
        overdue ? 'border-l-2 border-l-[#7A5500]' : ''
      }`}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm leading-relaxed text-foreground flex-1">{idea.raw_idea}</p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground">
                <MoreVertical size={14} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onMove(idea.id, 'instant')}>
                Move to Instant Inbox
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onMove(idea.id, 'weekly')}>
                Move to Weekly Inbox
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onMove(idea.id, 'parking_lot')}>
                Move to Parking Lot
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onArchive(idea.id)}
                className="text-destructive focus:text-destructive"
              >
                Archive
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">{timeAgo(idea.created_at)}</span>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${statusStyle.bg} ${statusStyle.text}`}
          >
            {idea.status}
          </span>
        </div>

        {isProcessing ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
            <Loader2 size={14} className="animate-spin" />
            Emily will process this in Session 8.
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onProcess(idea.id)}
            className="h-7 text-xs text-emily hover:text-emily hover:bg-secondary/10 w-full justify-start px-2"
          >
            <Sparkles size={13} className="mr-1.5" /> Process with Emily
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
