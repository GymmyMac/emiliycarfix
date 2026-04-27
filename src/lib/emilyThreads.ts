import { supabase } from '@/lib/supabase';

export interface ThreadSummary {
  session_id: string;
  title: string;
  last_at: string;
  turns: number;
}

export interface ThreadTurn {
  role: 'user' | 'emily';
  content: string;
  ts: number;
}

const ACTIVE_KEY = 'emily.activeSessionId';
const TITLE_OVERRIDE_KEY = 'emily.threadTitles'; // { [session_id]: customTitle }

// ---------- active session persistence ----------
export function getActiveSessionId(): string {
  let id = localStorage.getItem(ACTIVE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(ACTIVE_KEY, id);
  }
  return id;
}

export function setActiveSessionId(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id);
}

export function newSessionId(): string {
  const id = crypto.randomUUID();
  localStorage.setItem(ACTIVE_KEY, id);
  return id;
}

// ---------- title overrides (renames) ----------
function loadTitleOverrides(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(TITLE_OVERRIDE_KEY) || '{}');
  } catch {
    return {};
  }
}
function saveTitleOverrides(map: Record<string, string>): void {
  localStorage.setItem(TITLE_OVERRIDE_KEY, JSON.stringify(map));
}
export function renameThread(sessionId: string, title: string): void {
  const map = loadTitleOverrides();
  map[sessionId] = title.trim().slice(0, 80);
  saveTitleOverrides(map);
}

// ---------- thread list ----------
export async function listThreads(limit = 50): Promise<ThreadSummary[]> {
  // Pull recent conversation rows; group client-side by session_id.
  const { data, error } = await supabase
    .from('mkt_emily_conversations')
    .select('session_id, user_message, created_at')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error || !data) return [];

  const overrides = loadTitleOverrides();
  const bySession = new Map<string, ThreadSummary>();

  // data is desc; first row per session = latest. We want title = FIRST user_message
  // (oldest), so we'll pass twice: once for last_at + turns, then sort by oldest for title.
  for (const row of data) {
    const sid = row.session_id as string;
    if (!sid) continue;
    const existing = bySession.get(sid);
    if (!existing) {
      bySession.set(sid, {
        session_id: sid,
        title: '',
        last_at: row.created_at as string,
        turns: 1,
      });
    } else {
      existing.turns += 1;
    }
  }

  // Title pass: oldest user_message per session = first user prompt.
  // Iterate ascending to capture the first message per session.
  const ascending = [...data].reverse();
  for (const row of ascending) {
    const sid = row.session_id as string;
    const t = bySession.get(sid);
    if (t && !t.title && row.user_message) {
      t.title = String(row.user_message).slice(0, 60);
    }
  }

  // Apply overrides + fallback
  const out = Array.from(bySession.values()).map((t) => ({
    ...t,
    title: overrides[t.session_id] || t.title || 'Untitled chat',
  }));

  // Sort by last_at desc
  out.sort((a, b) => (a.last_at < b.last_at ? 1 : -1));
  return out.slice(0, limit);
}

// ---------- load turns for a thread ----------
export async function loadThread(sessionId: string): Promise<ThreadTurn[]> {
  const { data, error } = await supabase
    .from('mkt_emily_conversations')
    .select('user_message, emily_response, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error || !data) return [];

  const turns: ThreadTurn[] = [];
  for (const row of data) {
    const ts = new Date(row.created_at as string).getTime();
    if (row.user_message) turns.push({ role: 'user', content: row.user_message as string, ts });
    if (row.emily_response) turns.push({ role: 'emily', content: row.emily_response as string, ts });
  }
  return turns;
}

// ---------- persist a turn ----------
export async function saveTurn(sessionId: string, userMessage: string, emilyResponse: string): Promise<void> {
  await supabase.from('mkt_emily_conversations').insert({
    session_id: sessionId,
    user_message: userMessage,
    emily_response: emilyResponse,
  });
}

// ---------- delete a thread ----------
export async function deleteThread(sessionId: string): Promise<void> {
  await supabase.from('mkt_emily_conversations').delete().eq('session_id', sessionId);
  const map = loadTitleOverrides();
  delete map[sessionId];
  saveTitleOverrides(map);
}
