import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import {
  Rocket,
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Minus,
  CalendarIcon,
  Plus,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Initiative {
  id: string;
  title: string;
  initiative_type: string;
  status: string;
  roi?: number;
  pressure_test_score?: number;
  created_at: string;
  revenue_generated_30d?: number;
  revenue_target_30d?: number;
  revenue_generated_90d?: number;
  revenue_target_90d?: number;
  primary_metric_current?: string;
  success_metric_primary?: string;
  secondary_metric_current?: string;
  success_metric_secondary?: string;
  trend?: string;
  emily_assessment?: string;
  pressure_test_summary?: string;
  implementation_notes?: string;
  key_risks?: string[];
  tools_used?: string[];
  estimated_hours?: number;
  actual_hours?: number;
  target_launch_date?: string;
  actual_launch_date?: string;
  revenue_mechanism?: string;
  failure_threshold?: string;
}

function daysActive(createdAt: string) {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
}

function scoreColor(score: number) {
  if (score >= 80) return 'bg-[hsl(142,71%,45%)]';
  if (score >= 60) return 'bg-primary';
  if (score >= 40) return 'bg-[hsl(30,100%,50%)]';
  return 'bg-destructive';
}

function TrendArrow({ trend }: { trend?: string }) {
  if (trend === 'improving') return <TrendingUp size={16} className="text-[hsl(142,71%,45%)]" />;
  if (trend === 'declining') return <TrendingDown size={16} className="text-destructive" />;
  return <Minus size={16} className="text-muted-foreground" />;
}

function formatCurrency(n?: number) {
  if (n == null) return '$0';
  return '$' + n.toLocaleString();
}

// ─── Initiative Card ───
function InitiativeCard({ item, onClick }: { item: Initiative; onClick: () => void }) {
  const revPct = item.revenue_target_30d ? Math.min(100, ((item.revenue_generated_30d || 0) / item.revenue_target_30d) * 100) : 0;
  return (
    <Card
      onClick={onClick}
      className="cursor-pointer border border-border shadow-sm hover:shadow-md transition-shadow"
    >
      <CardContent className="p-4 space-y-3">
        {/* Title row */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-base text-foreground leading-tight break-words">{item.title}</h3>
          <Badge variant="secondary" className="shrink-0 text-xs">{item.initiative_type}</Badge>
        </div>

        {/* Score + days */}
        <div className="flex items-center gap-3 text-sm">
          {item.pressure_test_score != null && (
            <span className="flex items-center gap-1.5">
              <span className={cn('inline-block h-3 w-3 rounded-full', scoreColor(item.pressure_test_score))} />
              <span className="text-muted-foreground">{item.pressure_test_score}/100</span>
            </span>
          )}
          <span className="text-muted-foreground">{daysActive(item.created_at)}d active</span>
          <TrendArrow trend={item.trend} />
        </div>

        {/* Revenue */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{formatCurrency(item.revenue_generated_30d)}</span>
            <span>{formatCurrency(item.revenue_target_30d)}</span>
          </div>
          <Progress value={revPct} className="h-2" />
        </div>

        {/* Primary metric */}
        {item.primary_metric_current && (
          <p className="text-xs text-muted-foreground">
            {item.primary_metric_current} / {item.success_metric_primary || '—'}
          </p>
        )}

        {/* Emily assessment */}
        {item.emily_assessment && (
          <p className="text-xs text-muted-foreground truncate italic">
            {item.emily_assessment}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Tier Section ───
function TierSection({
  title,
  label,
  color,
  items,
  onCardClick,
}: {
  title: string;
  label: string;
  color: string;
  items: Initiative[];
  onCardClick: (item: Initiative) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <span className={cn('h-3 w-3 rounded-full', color)} />
        <h2 className="font-display text-lg text-foreground">{title}</h2>
      </div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="space-y-3">
        {items.map((item) => (
          <InitiativeCard key={item.id} item={item} onClick={() => onCardClick(item)} />
        ))}
      </div>
    </section>
  );
}

// ─── Micro Dashboard ───
function MicroDashboard({
  item,
  onBack,
  onArchive,
}: {
  item: Initiative;
  onBack: () => void;
  onArchive: (id: string) => void;
}) {
  const [showArchive, setShowArchive] = useState(false);
  const revPct30 = item.revenue_target_30d ? Math.min(100, ((item.revenue_generated_30d || 0) / item.revenue_target_30d) * 100) : 0;
  const revPct90 = item.revenue_target_90d ? Math.min(100, ((item.revenue_generated_90d || 0) / item.revenue_target_90d) * 100) : 0;

  return (
    <div className="space-y-6 pb-20">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-primary font-medium">
        <ArrowLeft size={16} /> Back to Pipeline
      </button>

      <div className="flex items-start justify-between gap-2 flex-wrap">
        <h1 className="font-display text-2xl text-foreground">{item.title}</h1>
        <Badge variant="secondary">{item.initiative_type}</Badge>
      </div>

      <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
        <span>Status: <strong className="text-foreground">{item.status}</strong></span>
        <span>{daysActive(item.created_at)}d active</span>
        {item.pressure_test_score != null && (
          <span className="flex items-center gap-1">
            <span className={cn('h-3 w-3 rounded-full', scoreColor(item.pressure_test_score))} />
            Score: {item.pressure_test_score}
          </span>
        )}
      </div>

      {/* Revenue 30d */}
      <Card className="border border-border shadow-sm">
        <CardHeader className="pb-2 p-4"><h3 className="font-display text-base">Revenue — 30 Day</h3></CardHeader>
        <CardContent className="p-4 pt-0 space-y-2">
          <div className="flex justify-between text-sm">
            <span>{formatCurrency(item.revenue_generated_30d)}</span>
            <span className="text-muted-foreground">{formatCurrency(item.revenue_target_30d)}</span>
          </div>
          <Progress value={revPct30} className="h-2" />
        </CardContent>
      </Card>

      {/* Revenue 90d */}
      <Card className="border border-border shadow-sm">
        <CardHeader className="pb-2 p-4"><h3 className="font-display text-base">Revenue — 90 Day</h3></CardHeader>
        <CardContent className="p-4 pt-0 space-y-2">
          <div className="flex justify-between text-sm">
            <span>{formatCurrency(item.revenue_generated_90d)}</span>
            <span className="text-muted-foreground">{formatCurrency(item.revenue_target_90d)}</span>
          </div>
          <Progress value={revPct90} className="h-2" />
        </CardContent>
      </Card>

      {/* Metrics */}
      <Card className="border border-border shadow-sm">
        <CardContent className="p-4 space-y-3">
          <h3 className="font-display text-base">Metrics</h3>
          <div className="text-sm space-y-1">
            <p>Primary: <strong>{item.primary_metric_current || '—'}</strong> / {item.success_metric_primary || '—'}</p>
            <p>Secondary: <strong>{item.secondary_metric_current || '—'}</strong> / {item.success_metric_secondary || '—'}</p>
            <div className="flex items-center gap-1">Trend: <TrendArrow trend={item.trend} /></div>
          </div>
        </CardContent>
      </Card>

      {/* Emily Assessment */}
      {item.emily_assessment && (
        <Card className="border border-border shadow-sm">
          <CardContent className="p-4 space-y-2">
            <h3 className="font-display text-base">Emily's Assessment</h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.emily_assessment}</p>
          </CardContent>
        </Card>
      )}

      {/* Pressure Test */}
      {item.pressure_test_summary && (
        <Card className="border border-border shadow-sm">
          <CardContent className="p-4 space-y-2">
            <h3 className="font-display text-base">Pressure Test</h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.pressure_test_summary}</p>
          </CardContent>
        </Card>
      )}

      {/* Implementation Notes */}
      {item.implementation_notes && (
        <Card className="border border-border shadow-sm">
          <CardContent className="p-4 space-y-2">
            <h3 className="font-display text-base">Implementation Notes</h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.implementation_notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Key Risks */}
      {item.key_risks && item.key_risks.length > 0 && (
        <Card className="border border-border shadow-sm">
          <CardContent className="p-4 space-y-2">
            <h3 className="font-display text-base">Key Risks</h3>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              {item.key_risks.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Tools Used */}
      {item.tools_used && item.tools_used.length > 0 && (
        <Card className="border border-border shadow-sm">
          <CardContent className="p-4 space-y-2">
            <h3 className="font-display text-base">Tools Used</h3>
            <div className="flex flex-wrap gap-2">
              {item.tools_used.map((t, i) => <Badge key={i} variant="outline" className="text-xs">{t}</Badge>)}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Hours & Dates */}
      <Card className="border border-border shadow-sm">
        <CardContent className="p-4 space-y-2 text-sm">
          <h3 className="font-display text-base">Timeline & Effort</h3>
          <p>Estimated hours: <strong>{item.estimated_hours ?? '—'}</strong></p>
          <p>Actual hours: <strong>{item.actual_hours ?? '—'}</strong></p>
          <p>Target launch: <strong>{item.target_launch_date ? format(new Date(item.target_launch_date), 'PPP') : '—'}</strong></p>
          <p>Actual launch: <strong>{item.actual_launch_date ? format(new Date(item.actual_launch_date), 'PPP') : '—'}</strong></p>
        </CardContent>
      </Card>

      {/* Revenue Mechanism */}
      {item.revenue_mechanism && (
        <Card className="border border-border shadow-sm">
          <CardContent className="p-4 space-y-2">
            <h3 className="font-display text-base">Revenue Mechanism</h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.revenue_mechanism}</p>
          </CardContent>
        </Card>
      )}

      {/* Failure Threshold */}
      {item.failure_threshold && (
        <Card className="border border-border shadow-sm">
          <CardContent className="p-4 space-y-2">
            <h3 className="font-display text-base">Failure Threshold</h3>
            <p className="text-sm text-muted-foreground">{item.failure_threshold}</p>
          </CardContent>
        </Card>
      )}

      {/* Archive */}
      <Button
        variant="outline"
        className="w-full border-foreground text-foreground hover:bg-foreground hover:text-background"
        onClick={() => setShowArchive(true)}
      >
        Archive Initiative
      </Button>

      <AlertDialog open={showArchive} onOpenChange={setShowArchive}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive "{item.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will move the initiative to archived status. You can still view it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => onArchive(item.id)}>Confirm Archive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── New Initiative Form ───
function NewInitiativeModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [initiativeType, setInitiativeType] = useState('content');
  const [revenueMechanism, setRevenueMechanism] = useState('');
  const [revenueTarget30, setRevenueTarget30] = useState('');
  const [revenueTarget90, setRevenueTarget90] = useState('');
  const [successPrimary, setSuccessPrimary] = useState('');
  const [successSecondary, setSuccessSecondary] = useState('');
  const [failureThreshold, setFailureThreshold] = useState('');
  const [pressureScore, setPressureScore] = useState('');
  const [pressureSummary, setPressureSummary] = useState('');
  const [implNotes, setImplNotes] = useState('');
  const [estHours, setEstHours] = useState('');
  const [launchDate, setLaunchDate] = useState<Date | undefined>();

  const reset = () => {
    setTitle(''); setInitiativeType('content'); setRevenueMechanism('');
    setRevenueTarget30(''); setRevenueTarget90(''); setSuccessPrimary('');
    setSuccessSecondary(''); setFailureThreshold(''); setPressureScore('');
    setPressureSummary(''); setImplNotes(''); setEstHours(''); setLaunchDate(undefined);
  };

  const handleSave = async () => {
    if (!title.trim()) { toast({ title: 'Title is required', variant: 'destructive' }); return; }
    setSaving(true);
    const { error } = await supabase.from('mkt_initiatives').insert({
      title: title.trim(),
      initiative_type: initiativeType,
      status: 'planning',
      revenue_mechanism: revenueMechanism || null,
      revenue_target_30d: revenueTarget30 ? Number(revenueTarget30) : null,
      revenue_target_90d: revenueTarget90 ? Number(revenueTarget90) : null,
      success_metric_primary: successPrimary || null,
      success_metric_secondary: successSecondary || null,
      failure_threshold: failureThreshold || null,
      pressure_test_score: pressureScore ? Number(pressureScore) : null,
      pressure_test_summary: pressureSummary || null,
      implementation_notes: implNotes || null,
      estimated_hours: estHours ? Number(estHours) : null,
      target_launch_date: launchDate ? format(launchDate, 'yyyy-MM-dd') : null,
    });
    setSaving(false);
    if (error) {
      toast({ title: 'Error creating initiative', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Initiative created' });
      reset();
      onOpenChange(false);
      onCreated();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">New Initiative</DialogTitle>
          <DialogDescription>Add a new initiative to the pipeline.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div><Label>Title *</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Initiative title" /></div>
          <div>
            <Label>Type</Label>
            <Select value={initiativeType} onValueChange={setInitiativeType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {['content', 'product', 'channel', 'experience', 'intelligence'].map((t) => (
                  <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Revenue Mechanism</Label><Textarea value={revenueMechanism} onChange={(e) => setRevenueMechanism(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Revenue Target 30d</Label><Input type="number" value={revenueTarget30} onChange={(e) => setRevenueTarget30(e.target.value)} /></div>
            <div><Label>Revenue Target 90d</Label><Input type="number" value={revenueTarget90} onChange={(e) => setRevenueTarget90(e.target.value)} /></div>
          </div>
          <div><Label>Success Metric Primary</Label><Input value={successPrimary} onChange={(e) => setSuccessPrimary(e.target.value)} /></div>
          <div><Label>Success Metric Secondary</Label><Input value={successSecondary} onChange={(e) => setSuccessSecondary(e.target.value)} /></div>
          <div><Label>Failure Threshold</Label><Input value={failureThreshold} onChange={(e) => setFailureThreshold(e.target.value)} /></div>
          <div><Label>Pressure Test Score (0-100)</Label><Input type="number" min={0} max={100} value={pressureScore} onChange={(e) => setPressureScore(e.target.value)} /></div>
          <div><Label>Pressure Test Summary</Label><Textarea value={pressureSummary} onChange={(e) => setPressureSummary(e.target.value)} /></div>
          <div><Label>Implementation Notes</Label><Textarea value={implNotes} onChange={(e) => setImplNotes(e.target.value)} /></div>
          <div><Label>Estimated Hours</Label><Input type="number" value={estHours} onChange={(e) => setEstHours(e.target.value)} /></div>
          <div>
            <Label>Target Launch Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !launchDate && 'text-muted-foreground')}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {launchDate ? format(launchDate, 'PPP') : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={launchDate} onSelect={setLaunchDate} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={saving} className="w-full bg-primary text-primary-foreground">
            {saving ? 'Saving…' : 'Create Initiative'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ───
export default function Initiatives() {
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<Initiative | null>(null);
  const [showNew, setShowNew] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('mkt_initiatives')
      .select('*')
      .order('created_at', { ascending: false });
    setInitiatives((data as Initiative[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const active = useMemo(() => initiatives.filter((i) => i.status !== 'archived'), [initiatives]);

  const { accelerate, maintain, review } = useMemo(() => {
    const sorted = [...active].sort((a, b) => (b.roi ?? 0) - (a.roi ?? 0));
    const top20 = Math.max(1, Math.ceil(sorted.length * 0.2));
    const bottom20 = Math.max(1, Math.ceil(sorted.length * 0.2));
    return {
      accelerate: sorted.slice(0, top20),
      maintain: sorted.slice(top20, sorted.length - bottom20),
      review: sorted.slice(sorted.length - bottom20),
    };
  }, [active]);

  const topPerformer = useMemo(() => {
    if (active.length === 0) return null;
    return [...active].sort((a, b) => (b.roi ?? 0) - (a.roi ?? 0))[0];
  }, [active]);

  const handleArchive = async (id: string) => {
    await supabase.from('mkt_initiatives').update({ status: 'archived' }).eq('id', id);
    toast({ title: 'Initiative archived' });
    setSelectedItem(null);
    fetchData();
  };

  if (selectedItem) {
    return (
      <div className="px-4 py-6 max-w-2xl mx-auto">
        <MicroDashboard item={selectedItem} onBack={() => setSelectedItem(null)} onArchive={handleArchive} />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto space-y-6 pb-20">
      {/* Top bar */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-display text-2xl text-foreground">Innovation Pipeline</h1>
            <Badge variant="secondary" className="mt-1 text-xs">
              {active.length} active initiative{active.length !== 1 ? 's' : ''}
            </Badge>
          </div>
          <Button onClick={() => setShowNew(true)} className="bg-primary text-primary-foreground shrink-0">
            <Plus size={16} /> New Initiative
          </Button>
        </div>

        {topPerformer && (
          <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 text-sm">
            🏆 Top performer: <strong className="text-foreground">{topPerformer.title}</strong>
            {topPerformer.roi != null && <span className="text-muted-foreground"> — ROI {topPerformer.roi}%</span>}
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : active.length === 0 ? (
        <Card className="border border-border shadow-sm">
          <CardContent className="p-8 text-center space-y-3">
            <Rocket size={40} className="mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">No active initiatives yet. Ideas that pass the Pressure Test will appear here.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <TierSection
            title="Accelerate"
            label="Top performers — increase allocation"
            color="bg-[hsl(142,71%,45%)]"
            items={accelerate}
            onCardClick={setSelectedItem}
          />
          <TierSection
            title="Maintain"
            label="On track"
            color="bg-primary"
            items={maintain}
            onCardClick={setSelectedItem}
          />
          <TierSection
            title="Review"
            label="Below target — review recommended"
            color="bg-[hsl(37,91%,44%)]"
            items={review}
            onCardClick={setSelectedItem}
          />
        </>
      )}

      <NewInitiativeModal open={showNew} onOpenChange={setShowNew} onCreated={fetchData} />
    </div>
  );
}
