import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import {
  Send,
  Copy,
  Lightbulb,
  Inbox,
  RotateCcw,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface ChatMessage {
  id: string;
  role: 'user' | 'emily';
  content: string;
  contextDocs?: string[];
  timestamp: Date;
}

const SUGGESTED_PROMPTS = [
  'What PSYOPS phase should I run this week?',
  'Write a social post for today',
  'How did last week\'s content perform?',
  'What are my customers telling us this week?',
];

const PLACEHOLDER_RESPONSE =
  "I'm being configured — my intelligence layer goes live in Session 8.\n\nThe interface is ready and waiting. Come back soon.";

export default function Emily() {
  const { user } = useAuth();
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const userInitial = user?.email?.charAt(0).toUpperCase() || 'U';

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, 50);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    // Log user message
    await supabase.from('mkt_emily_conversations').insert({
      session_id: sessionId,
      user_message: text.trim(),
      emily_response: null,
    }).select().maybeSingle();

    // Try edge function, fall back to placeholder
    let responseText = PLACEHOLDER_RESPONSE;
    let contextDocs: string[] = [];

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const jwt = sessionData?.session?.access_token;

      if (jwt) {
        const res = await fetch(
          `https://flpzjbasdsfwoeruyxgp.supabase.co/functions/v1/emily-chat`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${jwt}`,
            },
            body: JSON.stringify({ message: text.trim(), session_id: sessionId }),
          }
        );

        if (res.ok) {
          const data = await res.json();
          if (data.response) {
            responseText = data.response;
            contextDocs = data.context_docs || [];
          }
        }
      }
    } catch {
      // Fall through to placeholder
    }

    // Simulate delay for placeholder
    if (responseText === PLACEHOLDER_RESPONSE) {
      await new Promise((r) => setTimeout(r, 1500));
    }

    const emilyMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'emily',
      content: responseText,
      contextDocs,
      timestamp: new Date(),
    };

    setIsTyping(false);
    setMessages((prev) => [...prev, emilyMsg]);

    // Backup log emily response
    await supabase.from('mkt_emily_conversations').insert({
      session_id: sessionId,
      user_message: text.trim(),
      emily_response: responseText,
    }).maybeSingle();
  };

  const handleNewConversation = () => {
    setSessionId(crypto.randomUUID());
    setMessages([]);
    setInput('');
    inputRef.current?.focus();
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied to clipboard.' });
  };

  const handleAddToIdeas = async (text: string) => {
    const { error } = await supabase.from('mkt_ideas_bucket').insert({
      inbox_type: 'instant',
      raw_idea: text,
      status: 'raw',
    });
    if (!error) {
      toast({ title: 'Added to Ideas Bucket.', className: 'border-[#1A7A40] bg-[#1A7A40]/20 text-foreground' });
    }
  };

  const handleAddToQueue = async (text: string) => {
    const { error } = await supabase.from('mkt_content_queue').insert({
      content_type: 'social_post',
      draft_copy: text,
      status: 'pending',
    });
    if (!error) {
      toast({ title: 'Added to Queue.', className: 'border-[#1A7A40] bg-[#1A7A40]/20 text-foreground' });
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] -mt-2">
      {/* HEADER */}
      <div className="flex items-center justify-between pb-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-emily">Emily</h1>
          <p className="text-xs text-muted-foreground">CARFIX Marketing Intelligence</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#1A7A40] animate-pulse" />
          <span className="text-xs text-muted-foreground">Ready</span>
        </div>
      </div>

      {/* MESSAGE THREAD */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pr-1 min-h-0">
        {isEmpty && !isTyping && (
          <div className="flex items-center justify-center h-full">
            <div className="grid grid-cols-2 gap-3 max-w-lg">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
                  className="rounded-lg border border-border bg-card p-4 text-left text-sm text-foreground hover:bg-accent hover:border-emily/30 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            {/* Avatar */}
            <div
              className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                msg.role === 'emily'
                  ? 'bg-emily text-white'
                  : 'bg-primary text-primary-foreground'
              }`}
            >
              {msg.role === 'emily' ? 'E' : userInitial}
            </div>

            {/* Message bubble */}
            <div className={`max-w-[75%] space-y-2 ${msg.role === 'user' ? 'items-end' : ''}`}>
              {msg.role === 'emily' && (
                <span className="text-[11px] font-medium text-emily">Emily</span>
              )}
              <div
                className={`rounded-lg px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'emily'
                    ? 'bg-card border-l-2 border-l-emily text-foreground'
                    : 'bg-accent text-foreground'
                }`}
              >
                {msg.role === 'emily' ? (
                  <div className="prose prose-sm prose-invert max-w-none [&_p]:text-foreground [&_li]:text-foreground [&_strong]:text-foreground [&_h1]:text-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_code]:text-emily">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>

              {/* Context pills */}
              {msg.role === 'emily' && msg.contextDocs && msg.contextDocs.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {msg.contextDocs.map((doc, i) => (
                    <span
                      key={i}
                      className="inline-flex rounded-full bg-muted px-2.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {doc}
                    </span>
                  ))}
                </div>
              )}

              {/* Action buttons for Emily messages */}
              {msg.role === 'emily' && (
                <div className="flex items-center gap-1 pt-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => handleCopy(msg.content)}
                  >
                    <Copy size={13} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-emily"
                    onClick={() => handleAddToIdeas(msg.content)}
                  >
                    <Lightbulb size={13} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-primary"
                    onClick={() => handleAddToQueue(msg.content)}
                  >
                    <Inbox size={13} />
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {isTyping && (
          <div className="flex gap-3">
            <div className="h-8 w-8 rounded-full bg-emily flex items-center justify-center text-xs font-bold text-white shrink-0">
              E
            </div>
            <div className="rounded-lg bg-card border-l-2 border-l-emily px-4 py-3 flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emily/60 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="h-2 w-2 rounded-full bg-emily/60 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="h-2 w-2 rounded-full bg-emily/60 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
      </div>

      {/* INPUT BAR */}
      <div className="flex items-center gap-2 pt-4 border-t border-border mt-2 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleNewConversation}
          className="text-muted-foreground hover:text-foreground shrink-0"
          title="New Conversation"
        >
          <RotateCcw size={16} />
        </Button>
        <Input
          ref={inputRef}
          placeholder="Ask Emily anything..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendMessage(input);
            }
          }}
          disabled={isTyping}
          className="bg-accent border-border flex-1"
        />
        <Button
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || isTyping}
          className="bg-emily hover:bg-emily/80 text-white shrink-0"
          size="icon"
        >
          <Send size={16} />
        </Button>
      </div>
    </div>
  );
}
