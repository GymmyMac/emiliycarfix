import { useState } from 'react';
import { TASK_LIBRARY, TASK_GROUPS, type TaskDefinition } from '@/lib/taskPrompts';
import { PromptEditor } from './PromptEditor';
import { ChevronRight } from 'lucide-react';

interface Props {
  onPickTask: (task: TaskDefinition) => void;
}

export function TaskLauncher({ onPickTask }: Props) {
  const [editingPrompt, setEditingPrompt] = useState<string | null>(null);

  return (
    <aside className="w-60 shrink-0 h-full overflow-y-auto bg-card border-r border-border">
      <div className="px-4 py-3 border-b border-border sticky top-0 bg-card z-10">
        <h2 className="text-sm font-semibold text-foreground">Start a task</h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">Brief Emily — she does the rest</p>
      </div>

      <div className="p-2 space-y-3">
        {TASK_GROUPS.map((group) => {
          const items = TASK_LIBRARY.filter((t) => t.group === group.key);
          return (
            <div key={group.key}>
              <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                <span>{group.icon}</span>
                <span>{group.label}</span>
              </div>
              <div className="space-y-1">
                {items.map((task) => (
                  <div key={task.type}>
                    <button
                      onClick={() => onPickTask(task)}
                      className="group w-full text-left px-2 py-2 rounded-md hover:bg-accent transition-colors"
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-base leading-none mt-0.5">{task.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-medium text-foreground leading-tight">{task.name}</div>
                          <div className="text-[11px] text-muted-foreground leading-snug mt-0.5 truncate">
                            {task.description}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingPrompt(editingPrompt === task.type ? null : task.type);
                            }}
                            className="text-[10px] text-primary hover:underline mt-1 inline-flex items-center gap-0.5"
                          >
                            View Prompt <ChevronRight size={10} className={editingPrompt === task.type ? 'rotate-90 transition-transform' : 'transition-transform'} />
                          </button>
                        </div>
                      </div>
                    </button>
                    {editingPrompt === task.type && (
                      <PromptEditor task={task} onClose={() => setEditingPrompt(null)} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
