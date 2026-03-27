import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import ReactMarkdown from 'react-markdown';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface StagingRecord {
  id: string;
  sku: string;
  brand: string;
  aeo_json: Record<string, any>;
}

type CardStatus = 'pending' | 'approved' | 'rejected';

export default function BatchReview() {
  const { batchId } = useParams<{ batchId: string }>();
  const [records, setRecords] = useState<StagingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [cardStatuses, setCardStatuses] = useState<Record<string, CardStatus>>({});
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [approvingAll, setApprovingAll] = useState(false);

  useEffect(() => {
    if (!batchId) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('part_enrichment_staging')
        .select('id, sku, brand, aeo_json')
        .eq('batch_id', batchId)
        .eq('status', 'pending_review');
      if (error) {
        toast({ title: 'Error loading batch', description: error.message, variant: 'destructive' });
      } else {
        setRecords(data ?? []);
        const statuses: Record<string, CardStatus> = {};
        (data ?? []).forEach((r) => (statuses[r.id] = 'pending'));
        setCardStatuses(statuses);
      }
      setLoading(false);
    })();
  }, [batchId]);

  const approve = useCallback(async (id: string) => {
    setBusyIds((s) => new Set(s).add(id));
    const { error } = await supabase
      .from('part_enrichment_staging')
      .update({ james_approved: true, approved_at: new Date().toISOString(), status: 'approved' })
      .eq('id', id);
    setBusyIds((s) => { const n = new Set(s); n.delete(id); return n; });
    if (error) {
      toast({ title: 'Approve failed', description: error.message, variant: 'destructive' });
    } else {
      setCardStatuses((p) => ({ ...p, [id]: 'approved' }));
      toast({ title: 'Approved ✓' });
    }
  }, []);

  const reject = useCallback(async (id: string, reason: string) => {
    setBusyIds((s) => new Set(s).add(id));
    const { error } = await supabase
      .from('part_enrichment_staging')
      .update({ status: 'rejected', rejected_at: new Date().toISOString(), approval_notes: reason })
      .eq('id', id);
    setBusyIds((s) => { const n = new Set(s); n.delete(id); return n; });
    if (error) {
      toast({ title: 'Reject failed', description: error.message, variant: 'destructive' });
    } else {
      setCardStatuses((p) => ({ ...p, [id]: 'rejected' }));
      setRejectingId(null);
      setRejectReason('');
      toast({ title: 'Rejected' });
    }
  }, []);

  const approveAll = async () => {
    const pending = records.filter((r) => cardStatuses[r.id] === 'pending');
    if (!pending.length) return;
    setApprovingAll(true);
    for (const r of pending) {
      await approve(r.id);
    }
    setApprovingAll(false);
    toast({ title: `All ${pending.length} items approved ✓` });
  };

  const pendingCount = Object.values(cardStatuses).filter((s) => s === 'pending').length;

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-24">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
          EMILY — BATCH REVIEW
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Batch <span className="font-mono font-semibold text-foreground">{batchId}</span>
          {' · '}
          <span className="font-semibold">{pendingCount}</span> pending review
        </p>
      </div>

      {records.length === 0 && (
        <p className="text-muted-foreground">No pending items in this batch.</p>
      )}

      {/* Cards */}
      {records.map((rec) => {
        const status = cardStatuses[rec.id];
        const aeo = rec.aeo_json ?? {};
        const confidence = aeo.confidence_score as number | undefined;
        const answerText = aeo.answer_first?.text as string | undefined;
        const fitment = aeo.vehicle_fitment as any;
        const markdown = aeo.markdown_version as string | undefined;
        const busy = busyIds.has(rec.id);

        const confPct = confidence != null ? Math.round(confidence * (confidence <= 1 ? 100 : 1)) : null;
        const confColor =
          confPct == null ? 'bg-muted text-muted-foreground'
          : confPct >= 80 ? 'bg-[hsl(var(--success))] text-white'
          : confPct >= 50 ? 'bg-[hsl(30,100%,50%)] text-white'
          : 'bg-destructive text-destructive-foreground';

        return (
          <Card
            key={rec.id}
            className={`transition-opacity duration-300 ${status !== 'pending' ? 'opacity-40 pointer-events-none' : ''}`}
          >
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <div className="min-w-0">
                <p className="font-mono text-sm font-bold text-foreground truncate">{rec.sku}</p>
                <p className="text-xs text-muted-foreground">{rec.brand}</p>
              </div>
              {confPct != null && (
                <Badge className={`shrink-0 ${confColor}`}>{confPct}%</Badge>
              )}
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Description */}
              {answerText && (
                <p className="text-sm leading-relaxed text-foreground">{answerText}</p>
              )}

              {/* Vehicle fitment */}
              {fitment && <FitmentSection fitment={fitment} />}

              {/* Markdown */}
              {markdown && (
                <div className="prose prose-sm max-w-none rounded-md border border-border bg-accent/40 p-3 text-foreground">
                  <ReactMarkdown>{markdown}</ReactMarkdown>
                </div>
              )}

              {/* Actions */}
              {status === 'pending' && (
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => approve(rec.id)}
                    className="bg-[hsl(var(--success))] hover:bg-[hsl(var(--success))]/90 text-white"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                    Approve
                  </Button>

                  {rejectingId === rec.id ? (
                    <div className="flex flex-1 items-center gap-2">
                      <Input
                        placeholder="Reason (optional)"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        className="h-9 text-sm"
                      />
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busy}
                        onClick={() => reject(rec.id, rejectReason)}
                      >
                        Confirm
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setRejectingId(null); setRejectReason(''); }}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busy}
                      onClick={() => setRejectingId(rec.id)}
                    >
                      <XCircle className="h-4 w-4" /> Reject
                    </Button>
                  )}
                </div>
              )}

              {status === 'approved' && <p className="text-sm font-medium text-[hsl(var(--success))]">✓ Approved</p>}
              {status === 'rejected' && <p className="text-sm font-medium text-destructive">✗ Rejected</p>}
            </CardContent>
          </Card>
        );
      })}

      {/* Approve All */}
      {pendingCount > 0 && (
        <div className="sticky bottom-4 flex justify-center">
          <Button
            size="lg"
            disabled={approvingAll}
            onClick={approveAll}
            className="bg-[hsl(var(--success))] hover:bg-[hsl(var(--success))]/90 text-white shadow-lg"
          >
            {approvingAll && <Loader2 className="h-4 w-4 animate-spin" />}
            Approve All Remaining ({pendingCount})
          </Button>
        </div>
      )}
    </div>
  );
}

function FitmentSection({ fitment }: { fitment: any }) {
  if (!fitment || (Array.isArray(fitment) && fitment.length === 0)) return null;

  const arr = Array.isArray(fitment) ? fitment : [fitment];

  // Check if structured objects
  if (typeof arr[0] === 'object' && arr[0] !== null && ('make' in arr[0] || 'model' in arr[0])) {
    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Make</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Years</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {arr.map((v: any, i: number) => (
              <TableRow key={i}>
                <TableCell className="font-medium">{v.make ?? '—'}</TableCell>
                <TableCell>{v.model ?? '—'}</TableCell>
                <TableCell>
                  {v.year_start && v.year_end ? `${v.year_start}–${v.year_end}` : v.year_start || v.year_end || '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  // String list fallback
  return (
    <ul className="list-disc pl-5 text-sm text-foreground space-y-1">
      {arr.map((item: any, i: number) => (
        <li key={i}>{String(item)}</li>
      ))}
    </ul>
  );
}
