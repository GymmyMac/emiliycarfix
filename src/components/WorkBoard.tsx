import { useWorkBoard, workBoard, type WorkColumn, type WorkCardData } from '@/lib/workBoardStore';
import { WorkCard } from './WorkCard';

const COLUMNS: { key: WorkColumn; label: string; description: string }[] = [
  { key: 'queued', label: 'Queued', description: 'Briefed, not started' },
  { key: 'in_progress', label: 'In Progress', description: 'Emily is working' },
  { key: 'review', label: 'Review', description: 'Awaiting James' },
  { key: 'approved', label: 'Approved', description: 'Executing' },
  { key: 'live', label: 'Live', description: 'Done' },
];

export function WorkBoard() {
  const cards = useWorkBoard();

  const handleApprove = (card: WorkCardData) => {
    // Generic content approval: send to mkt_content_queue would happen via existing pipelines.
    workBoard.moveCard(card.id, 'live');
    workBoard.pushActivity('✓', `Approved — ${card.title}`);
  };
  const handleReject = (card: WorkCardData) => {
    workBoard.removeCard(card.id);
    workBoard.pushActivity('✗', `Rejected — ${card.title}`);
  };

  return (
    <div className="flex-1 min-h-0 overflow-x-auto bg-background">
      <div className="flex gap-3 p-4 h-full min-w-max">
        {COLUMNS.map((col) => {
          const colCards = cards.filter((c) => c.column === col.key);
          return (
            <div key={col.key} className="w-72 shrink-0 flex flex-col h-full">
              <div className="px-1 pb-2 sticky top-0">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">{col.label}</h3>
                  <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                    {colCards.length}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{col.description}</div>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {colCards.length === 0 && (
                  <div className="text-[11px] text-muted-foreground text-center py-6 border-2 border-dashed border-border rounded-lg">
                    —
                  </div>
                )}
                {colCards.map((card) => (
                  <WorkCard key={card.id} card={card} onApprove={handleApprove} onReject={handleReject} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
