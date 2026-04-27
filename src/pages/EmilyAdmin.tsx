import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Settings, Sparkles, ChevronDown, Square } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { TaskLauncher } from '@/components/TaskLauncher';
import { WorkBoard } from '@/components/WorkBoard';
import { ActivityFeed } from '@/components/ActivityFeed';
import { BriefModal } from '@/components/BriefModal';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { workBoard } from '@/lib/workBoardStore';
import { detectWikiBrief } from '@/lib/wikiBriefWorkflow';
import { TASK_LIBRARY, getTask, loadPromptOverride, type TaskDefinition } from '@/lib/taskPrompts';
import { callEmilyChat } from '@/lib/emilyChat';

// ---------- Generic content task executor ----------
async function runContentTask(task: TaskDefinition, brief: string, cardId: string) {
  workBoard.moveCard(cardId, 'in_progress');
  workBoard.pushActivity('▶', `Started — ${task.name}`);

  // Resolve prompt: override or default, with simple {topic}/{count} substitution.
  const promptTemplate = (await loadPromptOverride(task.type)) || task.defaultPrompt;
  const prompt = promptTemplate
    .replace(/\{topic\}/g, brief)
    .replace(/\{city\}/g, brief)
    .replace(/\{vehicle_slug\}/g, brief)
    .replace(/\{count\}/g, String(25));

  try {
    const json = await callEmilyChat({
      message: prompt,
      messages: [{ role: 'user', content: prompt }],
      session_id: `task-${task.type}-${Date.now()}`,
    });
    const reply = json?.response || '';
    workBoard.updateCard(cardId, { resultText: reply, column: 'review' });
    workBoard.pushActivity('✏', `Draft ready — ${task.name}`);
  } catch (e: any) {
    workBoard.updateCard(cardId, { errorText: e?.message || 'Unknown error', column: 'queued' });
    workBoard.pushActivity('✗', `Failed — ${task.name}: ${e?.message}`);
  }
}

// Brief Emily for a task — adds the right kind of card to the board.
function brief(task: TaskDefinition, briefText: string) {
  const isWiki = task.type === 'wiki_batch';
  if (isWiki) {
    const detected = detectWikiBrief(briefText);
    const limit = detected.matched ? detected.batchLimit : 25;
    const card = workBoard.addCard({
      taskType: task.type,
      task,
      title: `Wiki batch — ${briefText.slice(0, 60)}`,
      briefText,
      column: 'review',
      batchLimit: limit,
    });
    workBoard.pushActivity('📋', `Wiki brief received — "${briefText.slice(0, 60)}"`);
    return card;
  }

  const card = workBoard.addCard({
    taskType: task.type,
    task,
    title: `${task.name} — ${briefText.slice(0, 50)}`,
    briefText,
    column: 'queued',
  });
  workBoard.pushActivity('📋', `Briefed — ${task.name}: ${briefText.slice(0, 60)}`);
  // Kick off the run after a tick so the card animation registers.
  setTimeout(() => runContentTask(task, briefText, card.id), 300);
  return card;
}

// ---------- Chat (kept, demoted) ----------
function ChatBar() {
  const [open, setOpen] = useState(true);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'emily'; content: string; ts: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const sessionId = useRef(crypto.randomUUID());
  const scrollRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setMessages((m) => [...m, { role: 'user', content: text, ts: Date.now() }]);
    setInput('');

    // If it looks like a known task type, route to the work board instead of chat.
    const wiki = detectWikiBrief(text);
    if (wiki.matched) {
      const wikiTask = getTask('wiki_batch')!;
      brief(wikiTask, text);
      setMessages((m) => [...m, { role: 'emily', content: `Created a wiki batch card on the board (~${wiki.batchLimit} pages). Review it on the board.`, ts: Date.now() }]);
      return;
    }
    const lc = text.toLowerCase();
    const matched = TASK_LIBRARY.find((t) =>
      t.type !== 'wiki_batch' && (
        lc.includes(t.name.toLowerCase()) ||
        (t.type === 'facebook_post' && /facebook|instagram\b/.test(lc)) ||
        (t.type === 'tiktok_script' && /tiktok/.test(lc)) ||
        (t.type === 'linkedin_post' && /linkedin/.test(lc)) ||
        (t.type === 'email_campaign' && /email\b/.test(lc)) ||
        (t.type === 'sms_campaign' && /\bsms\b/.test(lc))
      )
    );
    if (matched) {
      brief(matched, text);
      setMessages((m) => [...m, { role: 'emily', content: `Routed to the board as a ${matched.name} card.`, ts: Date.now() }]);
      return;
    }

    setBusy(true);
    try {
      const json = await callEmilyChat({
        message: text,
        messages: [...messages.map((m) => ({ role: m.role === 'emily' ? 'assistant' as const : 'user' as const, content: m.content })), { role: 'user', content: text }],
        session_id: sessionId.current,
      });
      setMessages((m) => [...m, { role: 'emily', content: json?.response || 'No response', ts: Date.now() }]);
    } catch (e: any) {
      setMessages((m) => [...m, { role: 'emily', content: `Error: ${e?.message}`, ts: Date.now() }]);
    } finally {
      setBusy(false);
    }
  };

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoGrow = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  };
  useEffect(() => { autoGrow(); }, [input]);

  return (
    <div className="border-t border-border/60 bg-gradient-to-b from-background to-card/40">
      {/* Conversation — only when there are messages */}
      {messages.length > 0 && (
        <div className="relative">
          <button
            onClick={() => setOpen((o) => !o)}
            className="absolute right-4 top-2 z-10 text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            {open ? 'Hide' : 'Show'} conversation
            <ChevronDown size={12} className={`transition-transform ${open ? '' : '-rotate-90'}`} />
          </button>
          {open && (
            <div ref={scrollRef} className="max-h-[40vh] overflow-y-auto px-6 pt-8 pb-4 space-y-5">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {m.role === 'emily' && (
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center mr-2 mt-0.5 shrink-0">
                      <Sparkles size={13} className="text-primary" />
                    </div>
                  )}
                  <div className={`${
                    m.role === 'user'
                      ? 'max-w-[75%] rounded-2xl rounded-br-md bg-primary text-primary-foreground px-4 py-2.5 text-sm'
                      : 'max-w-[80%] text-sm text-foreground'
                  }`}>
                    {m.role === 'user' ? (
                      <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
                    ) : (
                      <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-pre:my-2 prose-headings:mt-3 prose-headings:mb-1">
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {busy && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                    <Sparkles size={13} className="text-primary" />
                  </div>
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: '120ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: '240ms' }} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Floating composer */}
      <div className="px-4 py-4">
        <div className="mx-auto max-w-3xl">
          <div className="group relative flex items-end gap-2 rounded-3xl border border-border/70 bg-card shadow-sm focus-within:shadow-md focus-within:border-primary/40 transition-all px-3 py-2">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Message Emily…"
              rows={1}
              className="resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-2 py-2 text-sm min-h-[24px] max-h-[200px] leading-relaxed"
            />
            <Button
              onClick={send}
              disabled={!input.trim() || busy}
              size="icon"
              className="rounded-full h-9 w-9 shrink-0 shadow-sm"
            >
              {busy ? <Square size={14} className="fill-current" /> : <Send size={14} />}
            </Button>
          </div>
          <div className="mt-2 px-2 text-[10.5px] text-muted-foreground/70 text-center">
            Task keywords route to the board · Enter to send · Shift+Enter for newline
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Page ----------
export default function EmilyAdmin() {
  const [briefingTask, setBriefingTask] = useState<TaskDefinition | null>(null);

  return (
    <div className="-mx-4 md:-mx-6 -my-4 md:-my-6 h-[calc(100vh-3.5rem)] md:h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <header className="h-14 shrink-0 border-b border-border bg-card px-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles size={16} className="text-primary" />
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight text-foreground">Emily</div>
            <div className="text-[10px] text-muted-foreground leading-tight">Operations Centre</div>
          </div>
          <span className="ml-3 inline-flex items-center gap-1.5 text-[11px] text-success">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            Ready
          </span>
        </div>
        <Link to="/settings" className="text-muted-foreground hover:text-foreground transition-colors">
          <Settings size={16} />
        </Link>
      </header>

      {/* Three-panel body */}
      <div className="flex-1 min-h-0">
        <ResizablePanelGroup direction="horizontal" className="h-full w-full">
          <ResizablePanel defaultSize={18} minSize={12} maxSize={35}>
            <TaskLauncher onPickTask={setBriefingTask} />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={62} minSize={30}>
            <main className="h-full flex flex-col min-w-0">
              <WorkBoard />
              <ChatBar />
            </main>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={20} minSize={12} maxSize={40}>
            <ActivityFeed />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <BriefModal
        task={briefingTask}
        onClose={() => setBriefingTask(null)}
        onSubmit={(task, text) => {
          brief(task, text);
          setBriefingTask(null);
        }}
      />
    </div>
  );
}
