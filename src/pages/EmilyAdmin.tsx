import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Settings, Sparkles, ChevronDown, ChevronRight, Square, MessageSquarePlus, History, Trash2, Pencil, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { TaskLauncher } from '@/components/TaskLauncher';
import { WorkBoard } from '@/components/WorkBoard';
import { ActivityFeed } from '@/components/ActivityFeed';
import { BriefModal } from '@/components/BriefModal';
import { workBoard, useWorkBoard } from '@/lib/workBoardStore';
import { detectWikiBrief } from '@/lib/wikiBriefWorkflow';
import { TASK_LIBRARY, getTask, loadPromptOverride, type TaskDefinition } from '@/lib/taskPrompts';
import { callEmilyChat } from '@/lib/emilyChat';
import {
  getActiveSessionId,
  setActiveSessionId,
  newSessionId,
  listThreads,
  loadThread,
  saveTurn,
  renameThread,
  deleteThread,
  type ThreadSummary,
} from '@/lib/emilyThreads';

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
  const [sessionId, setSessionId] = useState<string>(() => getActiveSessionId());
  const [threadsOpen, setThreadsOpen] = useState(false);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  // Hydrate active thread from DB on mount and whenever sessionId changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const turns = await loadThread(sessionId);
      if (!cancelled) setMessages(turns);
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  // Refresh threads when drawer opens
  useEffect(() => {
    if (threadsOpen) {
      listThreads().then(setThreads);
    }
  }, [threadsOpen, messages.length]);

  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  const startNewThread = () => {
    const id = newSessionId();
    setSessionId(id);
    setMessages([]);
    setInput('');
  };

  const switchThread = (id: string) => {
    setActiveSessionId(id);
    setSessionId(id);
    setThreadsOpen(false);
  };

  const handleDelete = async (id: string) => {
    await deleteThread(id);
    setThreads((t) => t.filter((x) => x.session_id !== id));
    if (id === sessionId) startNewThread();
  };

  const submitRename = (id: string) => {
    if (renameValue.trim()) {
      renameThread(id, renameValue);
      setThreads((t) => t.map((x) => (x.session_id === id ? { ...x, title: renameValue.trim().slice(0, 80) } : x)));
    }
    setRenaming(null);
    setRenameValue('');
  };

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
        session_id: sessionId,
      });
      const reply = json?.response || 'No response';
      setMessages((m) => [...m, { role: 'emily', content: reply, ts: Date.now() }]);
      // Persist the turn so the thread can be resumed later
      saveTurn(sessionId, text, reply).catch((e) => console.warn('[emily] saveTurn failed', e));
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
    <div className="border-t border-border/60 bg-gradient-to-b from-background to-card/40 relative">
      {/* Threads drawer */}
      {threadsOpen && (
        <div className="absolute inset-0 z-30 flex">
          <div className="w-80 max-w-[80%] h-full bg-card border-r border-border shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-4 h-12 border-b border-border">
              <div className="text-sm font-semibold">Conversations</div>
              <button onClick={() => setThreadsOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X size={16} />
              </button>
            </div>
            <div className="px-3 py-2 border-b border-border">
              <Button size="sm" variant="outline" className="w-full justify-start gap-2" onClick={() => { startNewThread(); setThreadsOpen(false); }}>
                <MessageSquarePlus size={14} /> New chat
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {threads.length === 0 && (
                <div className="px-4 py-6 text-xs text-muted-foreground">No conversations yet.</div>
              )}
              {threads.map((t) => {
                const active = t.session_id === sessionId;
                const isRenaming = renaming === t.session_id;
                return (
                  <div
                    key={t.session_id}
                    className={`group px-3 py-2 mx-1 rounded-md cursor-pointer flex items-center gap-2 ${active ? 'bg-primary/10 text-foreground' : 'hover:bg-accent/40 text-muted-foreground'}`}
                    onClick={() => !isRenaming && switchThread(t.session_id)}
                  >
                    <div className="flex-1 min-w-0">
                      {isRenaming ? (
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') submitRename(t.session_id);
                            if (e.key === 'Escape') { setRenaming(null); setRenameValue(''); }
                          }}
                          onBlur={() => submitRename(t.session_id)}
                          className="w-full bg-background border border-border rounded px-2 py-1 text-xs"
                        />
                      ) : (
                        <>
                          <div className="text-xs font-medium truncate text-foreground">{t.title}</div>
                          <div className="text-[10px] text-muted-foreground/70">
                            {t.turns} {t.turns === 1 ? 'turn' : 'turns'} · {new Date(t.last_at).toLocaleDateString()}
                          </div>
                        </>
                      )}
                    </div>
                    {!isRenaming && (
                      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); setRenaming(t.session_id); setRenameValue(t.title); }}
                          className="p-1 hover:text-foreground"
                          title="Rename"
                        >
                          <Pencil size={11} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); if (confirm('Delete this conversation?')) handleDelete(t.session_id); }}
                          className="p-1 hover:text-destructive"
                          title="Delete"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex-1 bg-background/60 backdrop-blur-sm" onClick={() => setThreadsOpen(false)} />
        </div>
      )}

      {/* Conversation — only when there are messages */}
      {messages.length > 0 && (
        <div className="relative">
          <div className="absolute right-4 top-2 z-10 flex items-center gap-3">
            <button
              onClick={() => setThreadsOpen(true)}
              className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              title="Past conversations"
            >
              <History size={12} /> History
            </button>
            <button
              onClick={startNewThread}
              className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              title="Start a new conversation"
            >
              <MessageSquarePlus size={12} /> New
            </button>
            <button
              onClick={() => setOpen((o) => !o)}
              className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              {open ? 'Hide' : 'Show'}
              <ChevronDown size={12} className={`transition-transform ${open ? '' : '-rotate-90'}`} />
            </button>
          </div>
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

      {/* Empty-state header — give the user a way to reach history even with no messages */}
      {messages.length === 0 && (
        <div className="flex items-center justify-end gap-3 px-6 pt-2">
          <button
            onClick={() => setThreadsOpen(true)}
            className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <History size={12} /> History
          </button>
          <button
            onClick={startNewThread}
            className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <MessageSquarePlus size={12} /> New chat
          </button>
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
