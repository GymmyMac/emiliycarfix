import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function Dashboard() {
  const [docCount, setDocCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCount() {
      const { count, error } = await supabase
        .from('mkt_vectordb_documents')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');

      if (error) {
        setError(error.message);
      } else {
        setDocCount(count);
      }
    }
    fetchCount();
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <div className="rounded-lg border border-border bg-card p-6">
        <p className="text-muted-foreground">
          Dashboard — Session 4 builds the approval queue here.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-sm font-medium text-muted-foreground mb-2">Supabase Connection</h2>
        {error ? (
          <p className="text-sm text-destructive font-mono">{error}</p>
        ) : docCount !== null ? (
          <p className="text-sm font-mono">
            VectorDB: <span className="text-secondary font-semibold">{docCount}</span> documents loaded.{' '}
            <span className="text-emily">Emily is ready.</span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Checking connection…</p>
        )}
      </div>
    </div>
  );
}
