import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { format } from 'date-fns';

interface ReviewItem {
  sku: string;
  part_number: string | null;
  brand: string;
  batch_id: string;
  status: string;
  updated_at: string;
  aeo_json: Record<string, any>;
}

const statusConfig: Record<string, { label: string; icon: typeof CheckCircle2; classes: string }> = {
  published: { label: 'Published', icon: CheckCircle2, classes: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  pending_review: { label: 'Pending Review', icon: Clock, classes: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  rejected: { label: 'Rejected', icon: XCircle, classes: 'bg-destructive/15 text-destructive border-destructive/30' },
};

export default function Review() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('part_enrichment_staging')
        .select('sku, part_number, brand, batch_id, status, updated_at, aeo_json')
        .in('status', ['pending_review', 'published', 'rejected'])
        .order('updated_at', { ascending: false });
      if (!error) setItems(data ?? []);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Sort: pending first, then rejected, then published
  const statusOrder: Record<string, number> = { pending_review: 0, rejected: 1, published: 2 };
  const sorted = [...items].sort((a, b) => (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9));

  const pendingCount = items.filter(i => i.status === 'pending_review').length;
  const publishedCount = items.filter(i => i.status === 'published').length;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Content Review</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {items.length > 0
            ? <>
                <span className="font-semibold text-foreground">{pendingCount}</span> pending review
                {publishedCount > 0 && <> · <span className="font-semibold text-foreground">{publishedCount}</span> published</>}
              </>
            : "Nothing to review — Emily is still writing."}
        </p>
      </div>

      {sorted.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-accent/40 text-left">
                <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Part Number</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Brand</th>
                <th className="hidden px-4 py-3 font-medium text-muted-foreground md:table-cell">Product Type</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Confidence</th>
                <th className="hidden px-4 py-3 font-medium text-muted-foreground sm:table-cell">Batch</th>
                <th className="hidden px-4 py-3 font-medium text-muted-foreground md:table-cell">Date</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((item) => {
                const aeo = item.aeo_json ?? {};
                const category = aeo.schema?.category as string | undefined;
                const confidence = aeo.confidence_score as number | undefined;
                const confPct = confidence != null ? Math.round(confidence * (confidence <= 1 ? 100 : 1)) : null;
                const confColor =
                  confPct == null ? 'bg-muted text-muted-foreground'
                  : confPct >= 80 ? 'bg-emerald-500/15 text-emerald-400'
                  : confPct >= 50 ? 'bg-amber-500/15 text-amber-400'
                  : 'bg-destructive/15 text-destructive';

                const dateStr = item.updated_at
                  ? format(new Date(item.updated_at), "d MMM yyyy h:mmaaa")
                  : '—';

                const partNumber = item.part_number || aeo.schema?.sku || item.sku;
                const isPublished = item.status === 'published';
                const cfg = statusConfig[item.status] ?? statusConfig.pending_review;
                const StatusIcon = cfg.icon;

                return (
                  <tr
                    key={item.sku}
                    onClick={() => navigate(`/batch/${item.batch_id}`)}
                    className={`cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-accent/60 ${isPublished ? 'opacity-60' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={`gap-1 ${cfg.classes}`}>
                        <StatusIcon className="h-3 w-3" />
                        {cfg.label}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-foreground">{partNumber}</span>
                      <span className="ml-2 text-xs text-muted-foreground">SKU {item.sku}</span>
                    </td>
                    <td className="px-4 py-3 text-foreground">{item.brand}</td>
                    <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">{category || '—'}</td>
                    <td className="px-4 py-3">
                      {confPct != null ? <Badge variant="outline" className={confColor}>{confPct}%</Badge> : '—'}
                    </td>
                    <td className="hidden px-4 py-3 font-mono text-xs text-muted-foreground sm:table-cell">{item.batch_id}</td>
                    <td className="hidden px-4 py-3 text-xs text-muted-foreground md:table-cell">{dateStr}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
