import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Send } from 'lucide-react';
import type { TaskDefinition } from '@/lib/taskPrompts';

interface Props {
  task: TaskDefinition | null;
  onClose: () => void;
  onSubmit: (task: TaskDefinition, brief: string) => void;
}

export function BriefModal({ task, onClose, onSubmit }: Props) {
  const [brief, setBrief] = useState('');

  // Reset when task changes
  if (task && brief === '' && task.briefPlaceholder) {
    // intentional no-op — we want James to type fresh, placeholder shows guidance
  }

  const submit = () => {
    if (!task || !brief.trim()) return;
    onSubmit(task, brief.trim());
    setBrief('');
  };

  return (
    <Dialog open={!!task} onOpenChange={(o) => !o && (setBrief(''), onClose())}>
      <DialogContent className="sm:max-w-lg">
        {task && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="text-xl">{task.icon}</span>
                <span>{task.name}</span>
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-1">{task.description}</p>
            </DialogHeader>
            <div className="space-y-3">
              <label className="text-xs font-medium text-foreground">Brief Emily</label>
              <Textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder={task.briefPlaceholder}
                rows={4}
                className="text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
                }}
              />
              <div className="text-[10px] text-muted-foreground">
                Target: <span className="font-mono text-foreground">{task.target}</span> · ⌘/Ctrl+Enter to send
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => { setBrief(''); onClose(); }}>Cancel</Button>
                <Button onClick={submit} disabled={!brief.trim()}>
                  <Send size={14} className="mr-1.5" /> Send to Emily
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
