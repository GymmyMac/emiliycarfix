import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { X, Save, RotateCcw } from 'lucide-react';
import {
  loadPromptOverride,
  savePromptOverride,
  resetPromptOverride,
  type TaskDefinition,
} from '@/lib/taskPrompts';
import { toast } from '@/hooks/use-toast';

interface Props {
  task: TaskDefinition;
  onClose: () => void;
}

export function PromptEditor({ task, onClose }: Props) {
  const [value, setValue] = useState(task.defaultPrompt);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasOverride, setHasOverride] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const override = await loadPromptOverride(task.type);
        if (cancel) return;
        if (override) {
          setValue(override);
          setHasOverride(true);
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [task.type]);

  const save = async () => {
    setSaving(true);
    try {
      await savePromptOverride(task.type, value);
      setHasOverride(true);
      toast({ title: 'Prompt saved', description: task.name });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setSaving(true);
    try {
      await resetPromptOverride(task.type);
      setValue(task.defaultPrompt);
      setHasOverride(false);
      toast({ title: 'Reset to default', description: task.name });
    } catch (e: any) {
      toast({ title: 'Reset failed', description: e?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-md border border-border bg-muted/40 p-3 mt-2 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-foreground">
          {task.name} — Prompt {hasOverride && <span className="ml-1 text-[10px] text-primary">(custom)</span>}
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X size={14} />
        </button>
      </div>
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={5}
        disabled={loading || saving}
        className="text-xs font-mono bg-card"
      />
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={reset} disabled={saving || !hasOverride} className="text-xs h-7">
          <RotateCcw size={12} className="mr-1" /> Reset to Default
        </Button>
        <Button size="sm" onClick={save} disabled={saving || value === task.defaultPrompt && !hasOverride} className="text-xs h-7">
          <Save size={12} className="mr-1" /> Save
        </Button>
      </div>
    </div>
  );
}
