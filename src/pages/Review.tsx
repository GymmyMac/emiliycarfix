import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';

interface ReviewItem {
  sku: string;
  brand: string;
  batch_id: string;
  updated_at: string;
  aeo_json: Record<string, any>;
}

export default function Review() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('part_enrichment_staging')
        .select('sku, brand, batch_id, updated_at, aeo_json')
        .eq('status', 'pending_review')
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

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Content Review</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {items.length > 0
            ? <><span className="font-semibold text-foreground">{items.length}</span> items awaiting your review.</>
            : "Nothing to review — Emily is still writing."}
        </p>
      </div>

      {items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-accent/40 text-left">
                <th className="px-4 py-3 font-medium text-muted-foreground">SKU</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Brand</th>
                <th className="hidden px-4 py-3 font-medium text-muted-foreground md:table-cell">Product Type</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Confidence</th>
                <th className="hidden px-4 py-3 font-medium text-muted-foreground sm:table-cell">Batch</th>
                <th className="hidden px-4 py-3 font-medium text-muted-foreground md:table-cell">Date</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const aeo = item.aeo_json ?? {};
                const category = aeo.schema?.category as string | undefined;
                const confidence = aeo.confidence_score as number | undefined;
                const confPct = confidence != null ? Math.round(confidence * (confidence <= 1 ? 100 : 1)) : null;
                const confColor =
                  confPct == null ? 'bg-muted text-muted-foreground'
                  : confPct >= 80 ? 'bg-[hsl(var(--success))] text-white'
                  : confPct >= 50 ? 'bg-[hsl(30,100%,50%)] text-white'
                  : 'bg-destructive text-destructive-foreground';

                const dateStr = item.updated_at
                  ? format(new Date(item.updated_at), "d MMM yyyy h:mmaaa")
                  : '—';

                return (
                  <tr
                    key={item.sku}
                    onClick={() => navigate(`/batch/${item.batch_id}`)}
                    className="cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-accent/60"
                  >
                    <td className="px-4 py-3 font-mono font-semibold text-foreground">{item.sku}</td>
                    <td className="px-4 py-3 text-foreground">{item.brand}</td>
                    <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">{category || '—'}</td>
                    <td className="px-4 py-3">
                      {confPct != null ? <Badge className={confColor}>{confPct}%</Badge> : '—'}
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
