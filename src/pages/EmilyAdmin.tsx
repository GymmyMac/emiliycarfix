import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import { Send, Sparkles, Plus, RefreshCw, X, Check, FileUp, Brain, Settings2, MessageSquare, Activity, Zap, AlertTriangle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { detectWikiBrief } from '@/lib/wikiBriefWorkflow';
import { WikiBriefPanel } from '@/components/WikiBriefPanel';

const SUPABASE_URL = 'https://flpzjbasdsfwoeruyxgp.supabase.co';

interface ChatMessage {
  id: string;
  role: 'user' | 'emily';
  content: string;
  timestamp: Date;
  kind?: 'wiki-brief';
  wikiBatchLimit?: number;
}

const QUICK_PROMPTS = [
  { icon: '📊', text: 'How is CARFIX performing this week?' },
  { icon: '🔍', text: 'What should I focus on today?' },
  { icon: '⚡', text: 'Show me pending actions' },
  { icon: '🧠', text: 'What insights do you have?' },
  { icon: '🎯', text: "What's active in the State Engine?" },
];

const SESSION_KEY = 'emily_admin_session_id';

// ---------- Header Ticker ----------
function Ticker() {
  const [metrics, setMetrics] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_emily_metrics', { p_days: 7 });
      if (!error) setMetrics(data);
    } catch (_) {/* schema cache may lag */}
  }, []);

  useEffect(() => { load(); const i = setInterval(load, 60000); return () => clearInterval(i); }, [load]);

  if (!metrics) return <div className="text-xs text-[#94A3B8]">Loading metrics…</div>;

  const items = [
    { label: 'Orders 7d', value: metrics?.orders?.count ?? '—' },
    { label: 'Revenue 7d', value: metrics?.orders?.revenue ? `$${metrics.orders.revenue}` : '—' },
    { label: 'Bob Sessions 7d', value: metrics?.bob?.sessions ?? '—' },
    { label: 'Pipeline runs', value: metrics?.emily?.runs_completed ?? '—' },
    { label: 'Queued', value: metrics?.emily?.content_queued ?? '—' },
    { label: 'Insights new', value: metrics?.insights?.total_new ?? 0, urgent: (metrics?.insights?.new_urgent ?? 0) > 0 },
    { label: 'Pending', value: metrics?.actions?.pending_actions ?? 0, urgent: (metrics?.actions?.pending_actions ?? 0) > 0 },
    { label: 'KB docs', value: metrics?.knowledge?.documents ?? '—' },
  ];

  const isNonZero = (v: any) => v !== 0 && v !== '0' && v !== '—' && v != null;

  return (
    <div className="flex items-center gap-5 overflow-x-auto whitespace-nowrap text-xs scrollbar-none">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <span className="text-[#94A3B8]">{it.label}:</span>
          <span className={it.urgent || isNonZero(it.value) ? 'text-[#F59E0B] font-semibold' : 'text-[#94A3B8] font-medium'}>{it.value}</span>
        </span>
      ))}
    </div>
  );
}

// ---------- Chat Panel ----------
function ChatPanel() {
  const { user } = useAuth();
  const [sessionId, setSessionId] = useState<string>(() => {
    return sessionStorage.getItem(SESSION_KEY) || (() => {
      const id = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, id);
      return id;
    })();
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load existing conversation for session
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('mkt_emily_conversations')
        .select('user_message, emily_response, created_at')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })
        .limit(20);
      if (data?.length) {
        const loaded: ChatMessage[] = [];
        data.forEach((row: any) => {
          loaded.push({ id: crypto.randomUUID(), role: 'user', content: row.user_message, timestamp: new Date(row.created_at) });
          if (row.emily_response) loaded.push({ id: crypto.randomUUID(), role: 'emily', content: row.emily_response, timestamp: new Date(row.created_at) });
        });
        setMessages(loaded);
      }
    })();
  }, [sessionId]);

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 50);
    return () => clearTimeout(t);
  }, [messages, isTyping]);

  const send = async (text: string) => {
    if (!text.trim() || isTyping) return;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text.trim(), timestamp: new Date() };
    setMessages((m) => [...m, userMsg]);
    setInput('');

    // Wiki brief intercept: skip the Emily round-trip and run the
    // confirm → sample → approve → execute workflow inline.
    const wiki = detectWikiBrief(text);
    if (wiki.matched) {
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: 'emily',
          content: `Got it — I'll line up a wiki batch (~${wiki.batchLimit} pages) from the priority queue. Review the list, then click **Write Sample** so you can sign off on quality before I deploy.`,
          timestamp: new Date(),
          kind: 'wiki-brief',
          wikiBatchLimit: wiki.batchLimit,
        },
      ]);
      return;
    }

    setIsTyping(true);

    try {
      const { data: sess } = await supabase.auth.getSession();
      const jwt = sess?.session?.access_token;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/emily-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) },
        body: JSON.stringify({
          message: text.trim(),
          messages: [...messages.map((m) => ({ role: m.role === 'emily' ? 'assistant' : 'user', content: m.content })), { role: 'user', content: text.trim() }],
          session_id: sessionId,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || `Emily request failed (${res.status})`);
      }
      const reply = json?.response || 'No response';
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: 'emily', content: reply, timestamp: new Date() }]);
    } catch (e: any) {
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: 'emily', content: `Error: ${e?.message || 'unknown'}`, timestamp: new Date() }]);
    } finally {
      setIsTyping(false);
    }
  };

  const newConversation = () => {
    const id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
    setSessionId(id);
    setMessages([]);
  };

  const userInitial = user?.email?.charAt(0).toUpperCase() || 'J';

  return (
    <div className="flex flex-col h-full bg-[#1E293B] rounded-xl border border-[#334155] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#334155]">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-[#F59E0B]" />
          <h2 className="text-sm font-semibold tracking-wide text-white">EMILY</h2>
          <span className="text-xs text-[#94A3B8]">Strategic AI</span>
        </div>
        <Button variant="ghost" size="sm" onClick={newConversation} className="text-xs text-[#94A3B8] hover:text-white hover:bg-[#334155]">
          <RefreshCw size={12} className="mr-1.5" /> New
        </Button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
        {messages.length === 0 && !isTyping && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4 py-12">
            <div className="w-12 h-12 rounded-full bg-[#F59E0B]/10 flex items-center justify-center">
              <Sparkles size={20} className="text-[#F59E0B]" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">Ask Emily anything about CARFIX</p>
              <p className="text-xs text-[#94A3B8] mt-1">She has access to your knowledge base, metrics, and live state.</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center max-w-md">
              {QUICK_PROMPTS.map((p, i) => (
                <button key={i} onClick={() => send(p.text)}
                  className="text-xs px-3 py-1.5 rounded-full bg-[#0F172A] hover:bg-[#334155] border border-[#334155] text-[#94A3B8] hover:text-white transition-colors">
                  <span className="mr-1">{p.icon}</span>{p.text}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-xl px-4 py-3 text-sm ${
              m.role === 'user'
                ? 'bg-[#1E3A5F] text-white'
                : 'bg-[#0F172A] border-l-2 border-l-[#F59E0B] text-[#E2E8F0]'
            }`}>
              {m.role === 'emily' && (
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Sparkles size={10} className="text-[#F59E0B]" />
                  <span className="text-[10px] uppercase tracking-wider text-[#F59E0B] font-semibold">Emily</span>
                </div>
              )}
              <div className="prose prose-sm prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-headings:font-bold prose-headings:text-white prose-strong:text-white prose-code:text-[#F59E0B] prose-code:bg-[#0F172A] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:font-mono prose-code:before:content-none prose-code:after:content-none prose-pre:bg-[#0F172A] prose-pre:border prose-pre:border-[#334155]">
                <ReactMarkdown>{m.content}</ReactMarkdown>
              </div>
              <div className="text-[10px] text-[#64748B] mt-1.5">
                {m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-[#0F172A] border-l-2 border-l-[#F59E0B] rounded-xl px-4 py-3">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B] animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B] animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B] animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-[#334155] p-4">
        <div className="flex gap-2 items-end">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
            }}
            placeholder="Ask Emily anything about CARFIX..."
            rows={1}
            className="resize-none min-h-[44px] max-h-[140px] bg-[#0F172A] border-[#334155] text-sm text-white placeholder:text-[#64748B] focus-visible:ring-0 focus-visible:border-[#F59E0B] focus-visible:ring-offset-0"
          />
          <Button onClick={() => send(input)} disabled={!input.trim() || isTyping}
            className="bg-[#F59E0B] hover:bg-[#D97706] text-black h-11 px-4 disabled:opacity-50">
            <Send size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------- State Engine Card ----------
function StateEngineCard() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('carfix_events')
      .select('*')
      .order('priority', { ascending: false })
      .limit(20);
    if (!error) setEvents(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); const i = setInterval(load, 30000); return () => clearInterval(i); }, [load]);

  const toggle = async (ev: any) => {
    if (!confirm(`${ev.is_active ? 'Deactivate' : 'Activate'} "${ev.event_name}"? This will affect Bob, website, Emily, and AG.`)) return;
    const { error } = await supabase.from('carfix_events').update({ is_active: !ev.is_active }).eq('event_key', ev.event_key);
    if (error) toast({ title: 'Failed', description: error.message, variant: 'destructive' });
    else { toast({ title: ev.is_active ? 'Deactivated' : 'Activated', description: ev.event_name }); load(); }
  };

  const activeCount = events.filter(e => e.is_active && e.event_type !== 'base').length;

  const typeColor = (t: string) => ({
    base: 'bg-[#334155] text-[#94A3B8]',
    product_push: 'bg-blue-500/15 text-blue-400',
    campaign: 'bg-violet-500/15 text-violet-400',
    seasonal: 'bg-amber-500/15 text-amber-400',
    emergency: 'bg-red-500/15 text-red-400',
  } as any)[t] || 'bg-[#334155] text-[#94A3B8]';

  return (
    <Card className="p-5 bg-[#1E293B] border-[#334155] border-t-[#F59E0B] border-t shadow-md">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${activeCount > 0 ? 'bg-green-500 animate-pulse' : 'bg-[#475569]'}`} />
          <h3 className="text-sm font-semibold text-white">State Engine</h3>
        </div>
        <span className="text-xs text-[#94A3B8]">{events.length} events</span>
      </div>
      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 bg-[#0F172A] rounded animate-pulse" />)}</div>
      ) : events.length === 0 ? (
        <p className="text-sm text-[#475569]">No events configured.</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {events.map(ev => (
            <div key={ev.event_key} className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-[#0F172A] border border-[#334155]">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-medium truncate text-white">{ev.event_name}</span>
                  <Badge variant="outline" className={`${typeColor(ev.event_type)} text-[9px] px-1.5 py-0 border-0`}>{ev.event_type}</Badge>
                </div>
                <p className="text-[10px] text-[#94A3B8] mt-0.5">P{ev.priority} · {ev.ends_at ? `ends ${new Date(ev.ends_at).toLocaleDateString()}` : 'no expiry'}</p>
              </div>
              <button
                onClick={() => toggle(ev)}
                className={`relative w-9 h-5 rounded-full transition-colors ${ev.is_active ? 'bg-green-500' : 'bg-[#475569]'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${ev.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ---------- Insights Card ----------
function InsightsCard() {
  const [insights, setInsights] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('emily_insights')
      .select('*')
      .eq('status', 'new')
      .order('severity', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10);
    setInsights(data || []);
  }, []);

  useEffect(() => { load(); const i = setInterval(load, 60000); return () => clearInterval(i); }, [load]);

  const dismiss = async (id: string) => {
    await supabase.from('emily_insights').update({ status: 'dismissed' }).eq('id', id);
    load();
  };

  const sevColor = (s: string) => ({
    urgent: 'bg-red-500/15 text-red-400 border-red-500/30',
    opportunity: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    warning: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    info: 'bg-muted text-muted-foreground border-border',
  } as any)[s] || 'bg-muted text-muted-foreground border-border';

  const ago = (d: string) => {
    const diff = Date.now() - new Date(d).getTime();
    const h = Math.floor(diff / 3600000);
    if (h < 1) return `${Math.floor(diff / 60000)}m ago`;
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  return (
    <Card className="p-5 bg-[#1E293B] border-[#334155] border-t-[#F59E0B] border-t shadow-md">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-[#F59E0B]" />
          <h3 className="text-sm font-semibold text-white">Emily's Insights</h3>
        </div>
        {insights.length > 0 && <Badge className="bg-[#F59E0B]/20 text-[#F59E0B] border-0 text-[10px]">{insights.length} new</Badge>}
      </div>
      {insights.length === 0 ? (
        <p className="text-sm text-[#475569] flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500/50 animate-pulse" />
          No new insights. Emily is monitoring.
        </p>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {insights.slice(0, 5).map(ins => (
            <div key={ins.id} className="p-3 rounded-lg bg-[#0F172A] border border-[#334155]">
              <div className="flex items-start justify-between gap-2 mb-1">
                <Badge variant="outline" className={`${sevColor(ins.severity)} text-[9px] px-1.5 py-0`}>{ins.severity}</Badge>
                <span className="text-[10px] text-[#94A3B8]">{ago(ins.created_at)}</span>
              </div>
              <p className="text-xs font-semibold text-white">{ins.title}</p>
              <button onClick={() => setExpanded(p => ({ ...p, [ins.id]: !p[ins.id] }))}
                className="text-[11px] text-[#94A3B8] mt-1 text-left w-full">
                {expanded[ins.id] ? ins.analysis : (ins.analysis?.slice(0, 80) + (ins.analysis?.length > 80 ? '…' : ''))}
              </button>
              <div className="flex items-center justify-between gap-2 mt-2">
                <span className="text-[10px] text-[#94A3B8] uppercase">{ins.insight_type}</span>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-[#94A3B8] hover:text-white hover:bg-[#334155]" onClick={() => dismiss(ins.id)}>
                    <X size={10} className="mr-0.5" />Dismiss
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ---------- Pending Actions Card ----------
function PendingActionsCard() {
  const [actions, setActions] = useState<any[]>([]);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('emily_pending_actions')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(10);
    setActions(data || []);
  }, []);

  useEffect(() => { load(); const i = setInterval(load, 30000); return () => clearInterval(i); }, [load]);

  const approve = async (a: any) => {
    setActions((prev) => prev.filter((x) => x.id !== a.id));
    const { error } = await supabase.from('emily_pending_actions').update({
      status: 'approved', approved_at: new Date().toISOString(),
    }).eq('id', a.id);
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); load(); }
    else { toast({ title: 'Approved', description: a.title }); }
  };

  const reject = async (a: any) => {
    setActions((prev) => prev.filter((x) => x.id !== a.id));
    const { error } = await supabase.from('emily_pending_actions').update({
      status: 'rejected', rejected_at: new Date().toISOString(),
    }).eq('id', a.id);
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); load(); }
    else { toast({ title: 'Rejected', description: a.title }); }
  };

  return (
    <Card className="p-5 bg-[#1E293B] border-[#334155] border-t-[#F59E0B] border-t shadow-md">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap size={14} className="text-[#F59E0B]" />
          <h3 className="text-sm font-semibold text-white">Pending Approval</h3>
        </div>
        {actions.length > 0 && <Badge className="bg-[#F59E0B] text-black border-0 text-[10px]">{actions.length}</Badge>}
      </div>
      {actions.length === 0 ? (
        <p className="text-sm text-[#475569]">Nothing pending. Emily is ready.</p>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {actions.slice(0, 5).map(a => (
            <div key={a.id} className="p-3 rounded-lg bg-[#0F172A] border border-[#334155]">
              <div className="flex items-center justify-between gap-2 mb-1">
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-[#334155] text-[#94A3B8]">{a.action_type}</Badge>
                <span className="text-[10px] text-[#94A3B8]">{new Date(a.created_at).toLocaleDateString()}</span>
              </div>
              <p className="text-xs font-semibold text-white">{a.title}</p>
              {a.description && <p className="text-[11px] text-[#94A3B8] mt-1 line-clamp-2">{a.description}</p>}
              <div className="flex gap-1.5 mt-2">
                <Button size="sm" onClick={() => approve(a)}
                  className="h-7 px-2.5 text-[10px] bg-green-600 hover:bg-green-700 text-white">
                  <Check size={11} className="mr-1" />Approve
                </Button>
                <Button size="sm" variant="outline" onClick={() => reject(a)}
                  className="h-7 px-2.5 text-[10px] border-red-500/40 text-red-400 hover:bg-red-500/10 bg-transparent">
                  <X size={11} className="mr-1" />Reject
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ---------- Documents Tab ----------
function DocumentsTab() {
  const [docs, setDocs] = useState<any[]>([]);
  const [embedded, setEmbedded] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [docType, setDocType] = useState('Strategy');
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    const { data } = await supabase.from('emily_uploaded_documents').select('*').order('created_at', { ascending: false }).limit(50);
    setDocs(data || []);
    const { count } = await supabase.from('mkt_vectordb_documents').select('*', { count: 'exact', head: true });
    setEmbedded(count || 0);
  };

  useEffect(() => { load(); }, []);

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const path = `${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from('emily-documents').upload(path, file);
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from('emily_uploaded_documents').insert({
        title: title || file.name, document_type: docType, storage_path: path, status: 'uploaded', file_size: file.size,
      });
      if (insErr) throw insErr;
      toast({ title: 'Uploaded', description: 'Emily will process and extract key facts.' });
      setFile(null); setTitle('');
      load();
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
    } finally { setUploading(false); }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3">Upload Document</h3>
        <div className="space-y-3">
          <label className="block border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-amber-400/50 transition-colors">
            <input type="file" className="hidden" accept=".pdf,.docx,.md,.txt,.html"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); if (!title) setTitle(f.name.replace(/\.[^.]+$/, '')); } }} />
            <FileUp size={24} className="mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm">{file ? file.name : 'Drop a document here or click to browse'}</p>
            <p className="text-xs text-muted-foreground mt-1">.pdf, .docx, .md, .txt, .html</p>
          </label>
          {file && (
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
              <select value={docType} onChange={(e) => setDocType(e.target.value)}
                className="rounded-md bg-muted border border-border px-3 text-sm">
                {['Strategy','Marketing','Operations','Competitor Intel','Product','Technical','Financial','Other'].map(t => <option key={t}>{t}</option>)}
              </select>
              <Button onClick={upload} disabled={uploading} className="col-span-2 bg-amber-500 hover:bg-amber-600 text-black">
                {uploading ? 'Uploading…' : 'Upload & Process'}
              </Button>
            </div>
          )}
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Document Library</h3>
          <span className="text-xs text-muted-foreground">{embedded} embedded · {docs.length} uploads</span>
        </div>
        {docs.length === 0 ? (
          <p className="text-xs text-muted-foreground">No uploads yet. {embedded} embedded docs already in knowledge base.</p>
        ) : (
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {docs.map(d => (
              <div key={d.id} className="flex items-center justify-between gap-2 p-2 rounded bg-muted/40 text-xs">
                <span className="truncate flex-1">{d.title}</span>
                <Badge variant="outline" className="text-[9px]">{d.document_type}</Badge>
                <Badge variant="outline" className={`text-[9px] ${
                  d.status === 'active' ? 'bg-green-500/15 text-green-400' :
                  d.status === 'processing' ? 'bg-blue-500/15 text-blue-400 animate-pulse' :
                  d.status === 'failed' ? 'bg-red-500/15 text-red-400' : 'bg-muted text-muted-foreground'
                }`}>{d.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------- Memory Tab ----------
function MemoryTab() {
  const [memories, setMemories] = useState<any[]>([]);
  const [filter, setFilter] = useState<string>('all');

  const load = async () => {
    let q = supabase.from('emily_memory').select('*').eq('is_active', true).order('created_at', { ascending: false });
    if (filter !== 'all') q = q.eq('memory_type', filter);
    const { data } = await q.limit(100);
    setMemories(data || []);
  };

  useEffect(() => { load(); }, [filter]);

  const deactivate = async (id: string) => {
    await supabase.from('emily_memory').update({ is_active: false }).eq('id', id);
    load();
  };

  const typeColor = (t: string) => ({
    semantic: 'bg-blue-500/15 text-blue-400',
    episodic: 'bg-purple-500/15 text-purple-400',
    procedural: 'bg-teal-500/15 text-teal-400',
    preference: 'bg-amber-500/15 text-amber-400',
  } as any)[t] || 'bg-muted text-muted-foreground';

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Brain size={14} className="text-amber-400" />
          <h3 className="text-sm font-semibold">Emily's Memory</h3>
          <span className="text-xs text-muted-foreground">{memories.length} active</span>
        </div>
        <div className="flex gap-1">
          {['all','semantic','episodic','procedural','preference'].map(t => (
            <button key={t} onClick={() => setFilter(t)}
              className={`text-[10px] px-2 py-1 rounded ${filter === t ? 'bg-amber-500 text-black' : 'bg-muted text-muted-foreground'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>
      {memories.length === 0 ? (
        <p className="text-xs text-muted-foreground">No memories in this filter.</p>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {memories.map(m => (
            <div key={m.id} className="p-3 rounded-lg bg-muted/40 border border-border">
              <div className="flex items-start justify-between gap-2 mb-1">
                <Badge className={`${typeColor(m.memory_type)} border-0 text-[9px]`}>{m.memory_type}</Badge>
                <Button size="sm" variant="ghost" onClick={() => deactivate(m.id)} className="h-5 px-1 text-[10px]">
                  <X size={10} />
                </Button>
              </div>
              <p className="text-xs font-semibold">{m.subject}</p>
              <p className="text-[11px] text-muted-foreground mt-1">{m.content}</p>
              {m.tags?.length > 0 && (
                <div className="flex gap-1 mt-2 flex-wrap">
                  {m.tags.map((t: string, i: number) => <span key={i} className="text-[9px] px-1.5 py-0.5 bg-muted rounded">{t}</span>)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ---------- Controls Tab ----------
function ControlsTab() {
  const sections = [
    { icon: '🎛', title: 'State Engine', items: ['Activate / deactivate event', 'Create new event', 'View event history'] },
    { icon: '🤖', title: 'Bob Controls', items: ["Change Bob's greeting", 'Update Bob setting', 'View Bob analytics'] },
    { icon: '📝', title: 'Content Pipeline', items: ['Queue content batch', 'Reprioritise AEO queue', 'View content queue'] },
    { icon: '📧', title: 'Communications', items: ['Draft email campaign', 'Schedule social post'] },
    { icon: '🔔', title: 'AG Tasks', items: ['Create AG task', 'View recent AG tasks'] },
    { icon: '🧠', title: 'Memory & Knowledge', items: ['Add memory entry', 'Upload document', 'View KB stats'] },
    { icon: '📊', title: 'Analytics', items: ['Revenue 7d/30d', 'Bob conversations', 'Pipeline throughput'] },
  ];

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
      {sections.map(s => (
        <Card key={s.title} className="p-3">
          <h4 className="text-sm font-semibold mb-2">{s.icon} {s.title}</h4>
          <div className="space-y-1">
            {s.items.map(item => (
              <button key={item}
                onClick={() => {
                  const url = `/emily-admin?prompt=${encodeURIComponent(`Emily, help me: ${item}`)}`;
                  window.location.href = url;
                }}
                className="w-full text-left text-[11px] text-muted-foreground hover:text-foreground p-1.5 rounded hover:bg-muted/40 transition-colors">
                → {item}
              </button>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

// ---------- Conversations Tab ----------
function ConversationsTab() {
  const [convs, setConvs] = useState<any[]>([]);
  useEffect(() => {
    supabase.from('mkt_emily_conversations')
      .select('*').order('created_at', { ascending: false }).limit(100)
      .then(({ data }) => setConvs(data || []));
  }, []);

  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold mb-3">Conversation History</h3>
      <div className="space-y-1 max-h-96 overflow-y-auto">
        {convs.map(c => (
          <div key={c.id} className="text-xs p-2 rounded bg-muted/40 border border-border">
            <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
              <span>{new Date(c.created_at).toLocaleString()}</span>
              <span className="font-mono">{c.session_id?.slice(0, 8)}</span>
            </div>
            <p className="text-foreground"><span className="text-amber-400">J:</span> {c.user_message?.slice(0, 120)}</p>
            {c.emily_response && <p className="text-muted-foreground mt-1"><span className="text-amber-400">E:</span> {c.emily_response?.slice(0, 120)}…</p>}
          </div>
        ))}
        {convs.length === 0 && <p className="text-xs text-muted-foreground">No conversations yet.</p>}
      </div>
    </Card>
  );
}

// ---------- MAIN PAGE ----------
export default function EmilyAdmin() {
  return (
    <div className="-mx-4 md:-mx-6 -my-4 md:-my-6 min-h-[calc(100vh-3.5rem)] md:min-h-screen bg-[#0F172A] text-foreground">
      {/* Header */}
      <header className="h-[52px] border-b border-[#334155] bg-[#0F172A] px-5 flex items-center gap-6 sticky top-0 z-20">
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-base font-bold tracking-tight text-white">CARFIX</span>
          <span className="text-xs text-[#475569]">·</span>
          <span className="text-base font-bold text-[#F59E0B]">EMILY</span>
          <span className="text-[10px] uppercase tracking-wider text-[#64748B] ml-1 font-semibold">Admin</span>
        </div>
        <div className="flex-1 min-w-0">
          <Ticker />
        </div>
      </header>

      {/* Main grid */}
      <div className="p-4 grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 h-[calc(100vh-9rem)] min-h-[500px]">
          <ChatPanel />
        </div>
        <div className="lg:col-span-2 space-y-3 max-h-[calc(100vh-9rem)] overflow-y-auto pr-1">
          <StateEngineCard />
          <InsightsCard />
          <PendingActionsCard />
        </div>
      </div>

      {/* Bottom tabs */}
      <div className="px-4 pb-6">
        <Tabs defaultValue="documents">
          <TabsList className="bg-[#1E293B] border border-[#334155] h-auto p-1 gap-1">
            <TabsTrigger value="documents" className="data-[state=active]:bg-transparent data-[state=active]:text-[#F59E0B] data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[#F59E0B] rounded-none px-4 py-2 text-[#94A3B8] hover:text-white border-b-2 border-transparent">
              <FileUp size={13} className="mr-1.5" />Documents
            </TabsTrigger>
            <TabsTrigger value="memory" className="data-[state=active]:bg-transparent data-[state=active]:text-[#F59E0B] data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[#F59E0B] rounded-none px-4 py-2 text-[#94A3B8] hover:text-white border-b-2 border-transparent">
              <Brain size={13} className="mr-1.5" />Memory
            </TabsTrigger>
            <TabsTrigger value="controls" className="data-[state=active]:bg-transparent data-[state=active]:text-[#F59E0B] data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[#F59E0B] rounded-none px-4 py-2 text-[#94A3B8] hover:text-white border-b-2 border-transparent">
              <Settings2 size={13} className="mr-1.5" />Controls
            </TabsTrigger>
            <TabsTrigger value="conversations" className="data-[state=active]:bg-transparent data-[state=active]:text-[#F59E0B] data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[#F59E0B] rounded-none px-4 py-2 text-[#94A3B8] hover:text-white border-b-2 border-transparent">
              <MessageSquare size={13} className="mr-1.5" />Conversations
            </TabsTrigger>
          </TabsList>
          <TabsContent value="documents" className="mt-3"><DocumentsTab /></TabsContent>
          <TabsContent value="memory" className="mt-3"><MemoryTab /></TabsContent>
          <TabsContent value="controls" className="mt-3"><ControlsTab /></TabsContent>
          <TabsContent value="conversations" className="mt-3"><ConversationsTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
