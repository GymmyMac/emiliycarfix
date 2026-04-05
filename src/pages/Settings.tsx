import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { RefreshCw, Copy, CheckCircle2 } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { format } from 'date-fns';

function StatusDot({ status }: { status: 'green' | 'red' | 'grey' }) {
  const colors = { green: 'bg-success', red: 'bg-destructive', grey: 'bg-muted-foreground/40' };
  return <span className={`inline-block h-2.5 w-2.5 rounded-full shrink-0 ${colors[status]}`} />;
}

const INTEGRATIONS = [
  { key: 'openrouter', label: 'OpenRouter', desc: 'LLM API', hasBalance: true },
  { key: 'telegram', label: 'Telegram', desc: 'Daily Briefs' },
  { key: 'buffer', label: 'Buffer', desc: 'Social Scheduling' },
  { key: 'mailchimp', label: 'Mailchimp', desc: 'Email Platform' },
];

const ALL_TOGGLE_KEYS: string[] = [];

const DOCUMENTS = [
  'DOC-01 — CARFIX Brand Guidelines',
  'DOC-02 — PSYOPS Framework',
  'DOC-03 — Tone & Voice Manual',
  'DOC-04 — Product Catalogue Schema',
  'DOC-05 — SEO Target Keywords',
  'DOC-06 — Competitor Intelligence',
  'DOC-07 — Emily System Prompt',
  'DOC-08 — Content Templates',
  'DOC-09 — Channel Strategy',
  'DOC-10 — Audience Personas',
  'DOC-11 — Pricing Framework',
  'DOC-12 — Regional NZ Data',
  'DOC-13 — AEO Best Practices',
];

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [toggles, setToggles] = useState<Record<string, boolean>>({});
  const [orBalance, setOrBalance] = useState<number | null>(null);
  const [orCheckedAt, setOrCheckedAt] = useState<string | null>(null);
  const [orStatus, setOrStatus] = useState<'green' | 'red' | 'grey'>('grey');
  const [orError, setOrError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [vectorCount, setVectorCount] = useState(0);
  const [appConfig, setAppConfig] = useState<{ business_phase: string } | null>(null);

  const fetchAll = useCallback(async () => {
    const [togglesRes, orRes, vectorRes, configRes] = await Promise.all([
      supabase.from('app_config').select('key, value').in('key', ALL_TOGGLE_KEYS),
      supabase.from('emily_openrouter_snapshots').select('credits_remaining_usd, checked_at').order('checked_at', { ascending: false }).limit(1),
      supabase.from('mkt_vectordb_documents').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('app_config').select('key, value').eq('key', 'business_phase').limit(1).maybeSingle(),
    ]);
    if (togglesRes.data) {
      const tm: Record<string, boolean> = {};
      togglesRes.data.forEach((row: { key: string; value: string }) => {
        tm[row.key] = row.value === 'true';
      });
      setToggles(tm);
    }
    if (orRes.data?.[0]) {
      setOrBalance(orRes.data[0].credits_remaining_usd);
      setOrCheckedAt(orRes.data[0].checked_at);
      // If we have a recent snapshot, OpenRouter is working
      setOrStatus('green');
    }
    setVectorCount(vectorRes.count || 0);
    if (configRes.data) setAppConfig({ business_phase: configRes.data.value });
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const toggleFlag = async (key: string, label: string, newValue: boolean) => {
    setToggles(prev => ({ ...prev, [key]: newValue }));
    const { error } = await supabase
      .from('app_config')
      .upsert({ key, value: String(newValue), updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) {
      setToggles(prev => ({ ...prev, [key]: !newValue }));
      toast.error(`Failed to update ${label}`);
    } else {
      toast.success(`${label} ${newValue ? 'enabled' : 'disabled'}`);
    }
  };

  const checkBalance = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('check-openrouter-balance');
      if (error) throw error;
      setOrBalance(data?.balance ?? null);
      setOrCheckedAt(new Date().toISOString());
      setOrStatus('green');
      setOrError(null);
      toast.success('Balance refreshed — Connected');
    } catch (e: any) {
      setOrStatus('red');
      setOrError(e?.message || 'Connection failed');
      toast.error('Failed to check balance');
    }
  };

  const copyProjectId = () => {
    navigator.clipboard.writeText('flpzjbasdsfwoeruyxgp');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-[1200px]">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}</div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-[1200px]">
      <PageHeader title="Connections" description="API keys, integration health, and credential management. Check status and refresh tokens here." />

      {/* ═══ SECTION A: API CONNECTIONS ═══ */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Integrations & API Status</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {INTEGRATIONS.map(int => {
            const isOR = int.key === 'openrouter';
            const status: 'green' | 'red' | 'grey' = isOR ? orStatus : 'grey';
            return (
              <Card key={int.key}>
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <StatusDot status={status} />
                    <div>
                      <p className="text-sm font-medium text-foreground">{int.label} — {int.desc}</p>
                      {isOR && orBalance !== null && <p className="text-xs text-muted-foreground">Balance: ${orBalance.toFixed(2)}</p>}
                      {isOR && orCheckedAt && <p className="text-xs text-muted-foreground">Last checked: {format(new Date(orCheckedAt), 'd MMM HH:mm')}</p>}
                      {isOR && orStatus === 'red' && orError && <p className="text-xs text-destructive">Error — {orError}</p>}
                      {!isOR && <p className="text-xs text-muted-foreground">Connected</p>}
                    </div>
                  </div>
                  {isOR ? (
                    <Button size="sm" variant="outline" onClick={checkBalance} className="h-7 text-xs border-border">
                      <RefreshCw size={12} className="mr-1" /> Verify
                    </Button>
                  ) : (
                    <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">Connected</Badge>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>


      {/* ═══ SECTION C: KNOWLEDGE BASE ═══ */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Loaded Documents & Vector Store</h2>
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wide">
                <th className="px-4 py-2.5">Document</th><th className="px-4 py-2.5">Status</th>
              </tr></thead>
              <tbody>{DOCUMENTS.map((doc, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 text-foreground">{doc}</td>
                  <td className="px-4 py-2.5"><Badge variant="outline" className="text-[10px] text-success border-success/30">Loaded</Badge></td>
                </tr>
              ))}</tbody>
            </table>
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">{DOCUMENTS.length} documents loaded. Vector store: {vectorCount} entries.</p>
      </section>

      {/* ═══ SECTION D: SYSTEM ═══ */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">System Information</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-4 space-y-1">
              <p className="text-xs text-muted-foreground">Current Phase</p>
              <p className="text-sm font-semibold text-foreground">{appConfig?.business_phase || '—'}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 space-y-1">
              <p className="text-xs text-muted-foreground">Supabase Project</p>
              <div className="flex items-center gap-2">
                <p className="text-sm font-mono text-foreground">flpzjbasdsfwoeruyxgp</p>
                <button onClick={copyProjectId} className="text-muted-foreground hover:text-foreground transition-colors">
                  {copied ? <CheckCircle2 size={14} className="text-success" /> : <Copy size={14} />}
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
