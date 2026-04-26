import { useState } from 'react';
import { Pencil, ExternalLink, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { workBoard, type WorkCardData } from '@/lib/workBoardStore';
import { BADGE_COLORS } from '@/lib/taskPrompts';
import { WikiBriefPanel } from './WikiBriefPanel';

interface Props {
  card: WorkCardData;
  onApprove?: (card: WorkCardData) => void;
  onReject?: (card: WorkCardData) => void;
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function WorkCard({ card, onApprove, onReject }: Props) {
  const [expanded, setExpanded] = useState(false);
  const isInProgress = card.column === 'in_progress';
  const isReview = card.column === 'review';
  const isLive = card.column === 'live';

  return (
    <div
      className={`rounded-lg border bg-card shadow-card hover:shadow-card-hover transition-shadow ${
        isInProgress ? 'border-l-4 border-l-primary border-y-border border-r-border' : 'border-border'
      }`}
    >
      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <span className={`text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded ${BADGE_COLORS[card.task.badgeLabel]}`}>
            {card.task.badgeLabel}
          </span>
          {isInProgress && (
            <span className="inline-block animate-pen-write text-base" aria-label="writing">
              <Pencil size={14} className="text-primary" />
            </span>
          )}
        </div>
        <div className="text-[13px] font-semibold text-foreground leading-tight">{card.title}</div>
        <div className="text-[11px] text-muted-foreground space-y-0.5">
          <div className="font-mono truncate">{card.task.target}</div>
          <div>{relativeTime(card.createdAt)}</div>
        </div>

        {isInProgress && card.progress && (
          <div className="space-y-1.5 pt-1">
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>{card.progress.current} of {card.progress.total}</span>
              <span>{Math.round((card.progress.current / Math.max(card.progress.total, 1)) * 100)}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${(card.progress.current / Math.max(card.progress.total, 1)) * 100}%` }}
              />
            </div>
            {card.progress.currentLabel && (
              <div className="text-[10px] text-muted-foreground truncate font-mono">⟳ {card.progress.currentLabel}</div>
            )}
          </div>
        )}

        {isReview && card.taskType === 'wiki_batch' && (
          <div className="pt-2">
            <WikiBriefPanel
              batchLimit={card.batchLimit ?? 25}
              onDone={(summary) => {
                workBoard.updateCard(card.id, { column: 'live', resultText: summary });
                workBoard.pushActivity('✓', `Wiki batch complete — ${summary}`);
              }}
              onReject={() => {
                workBoard.removeCard(card.id);
                workBoard.pushActivity('✗', `Brief rejected — ${card.title}`);
                onReject?.(card);
              }}
            />
          </div>
        )}

        {isReview && card.taskType !== 'wiki_batch' && card.resultText && (
          <div className="pt-2 space-y-2">
            <div className={`text-[12px] text-foreground whitespace-pre-wrap ${expanded ? '' : 'line-clamp-6'}`}>
              {card.resultText}
            </div>
            {card.resultText.length > 300 && (
              <button onClick={() => setExpanded((e) => !e)} className="text-[10px] text-primary hover:underline">
                {expanded ? 'Show less' : 'Show more'}
              </button>
            )}
            <div className="flex gap-2 pt-1">
              <Button size="sm" className="h-7 text-xs" onClick={() => onApprove?.(card)}>
                <Check size={12} className="mr-1" /> Approve
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onReject?.(card)}>
                <X size={12} className="mr-1" /> Reject
              </Button>
            </div>
          </div>
        )}

        {isLive && card.resultText && (
          <div className="pt-1 space-y-1">
            <div className="text-[11px] text-success font-medium">{card.resultText}</div>
            <a
              href={`https://supabase.com/dashboard/project/flpzjbasdsfwoeruyxgp/editor`}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] text-primary hover:underline inline-flex items-center gap-0.5"
            >
              View in Supabase <ExternalLink size={9} />
            </a>
          </div>
        )}

        {card.errorText && (
          <div className="text-[11px] text-destructive">⚠ {card.errorText}</div>
        )}
      </div>
    </div>
  );
}
