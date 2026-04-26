import { useEffect, useRef, useState } from 'react';
import { useActivityFeed } from '@/lib/workBoardStore';

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function ActivityFeed() {
  const entries = useActivityFeed();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const lastScrollTop = useRef(0);

  useEffect(() => {
    if (!autoScroll || !scrollRef.current) return;
    scrollRef.current.scrollTop = 0; // newest is at top
  }, [entries, autoScroll]);

  const onScroll = () => {
    if (!scrollRef.current) return;
    const st = scrollRef.current.scrollTop;
    // If user scrolls down past 40px from top → pause auto-scroll
    if (st > 40 && autoScroll) setAutoScroll(false);
    if (st <= 4 && !autoScroll) setAutoScroll(true);
    lastScrollTop.current = st;
  };

  // Today summary
  const today = new Date().setHours(0, 0, 0, 0);
  const todayEntries = entries.filter((e) => e.ts >= today);
  const wikiCount = todayEntries.filter((e) => e.text.toLowerCase().includes('wiki page live')).length;
  const postCount = todayEntries.filter((e) => /facebook|instagram|tiktok|linkedin|reddit/i.test(e.text) && e.icon === '✓').length;
  const emailCount = todayEntries.filter((e) => /email|sms/i.test(e.text) && e.icon === '✓').length;

  return (
    <aside className="w-[300px] shrink-0 h-full flex flex-col bg-card border-l border-border">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">Activity</h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {autoScroll ? 'Live · auto-scrolling' : 'Paused — scroll up to resume'}
        </p>
      </div>

      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-3 py-2">
        {entries.length === 0 && (
          <div className="text-[11px] text-muted-foreground text-center py-8">No activity yet.</div>
        )}
        <ul className="space-y-1">
          {entries.map((e) => (
            <li key={e.id} className="flex items-start gap-2 text-[11px] py-1 leading-snug">
              <span className="text-muted-foreground tabular-nums w-10 shrink-0">{fmtTime(e.ts)}</span>
              <span className="w-4 shrink-0 text-center">{e.icon}</span>
              <span className="text-foreground flex-1 break-words">{e.text}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="px-4 py-2 border-t border-border bg-muted/40">
        <div className="text-[10px] text-muted-foreground">Today</div>
        <div className="text-[11px] text-foreground">
          {wikiCount} wiki · {postCount} posts · {emailCount} emails
        </div>
      </div>
    </aside>
  );
}
