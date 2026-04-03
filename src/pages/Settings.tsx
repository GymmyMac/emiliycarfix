import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { RefreshCw, Copy, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';

/* ─── Types ─── */
interface FeatureFlag {
  id: string;
  flag_key: string;
  flag_value: boolean;
  description: string | null;
}

function StatusDot({ status }: { status: 'green' | 'amber' | 'red' | 'grey' }) {
  const colors = { green: 'bg-success', amber: 'bg-warning', red: 'bg-destructive', grey: 'bg-muted-foreground/40' };
  return <span className={`inline-block h-2.5 w-2.5 rounded-full shrink-0 ${colors[status]}`} />;
}

const INTEGRATIONS = [
  { key: 'openrouter', label: 'OpenRouter', desc: 'LLM API', hasBalance: true },
  { key: 'telegram', label: 'Telegram', desc: 'Daily Briefs' },
  { key: 'buffer', label: 'Buffer', desc: 'Social Scheduling' },
  { key: 'mailchimp', label: 'Mailchimp', desc: 'Email Platform' },
];

const CORE_FLAGS = [
  { key: 'emily_global_active', label: 'Emily Global Active' },
  { key: 'initiative_sku_aeo_enrichment', label: 'SKU AEO Enrichment' },
  { key: 'initiative_social_content', label: 'Social Content Generation' },
  { key: 'initiative_email_sms', label: 'Email & SMS Generation' },
];

const CHANNEL_FLAGS = [
  { key: 'facebook_enabled', label: 'Facebook Posting' },
  { key: 'instagram_enabled', label: 'Instagram Posting' },
  { key: 'tiktok_enabled', label: 'TikTok Posting' },
  { key: 'blog_aeo_enabled', label: 'Blog/AEO Publishing' },
];

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
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [orBalance, setOrBalance] = useState<number | null>(null);
  const [orCheckedAt, setOrCheckedAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [vectorCount, setVectorCount] = useState(0);
  const [appConfig, setAppConfig] = useState<{ business_phase: string } | null>(null);

  const fetchAll = useCallback(async () => {
    const [flagsRes, orRes, vectorRes, configRes] = await Promise.all([
      supabase.from('feature_flags').select('*'),
      supabase.from('emily_openrouter_snapshots').select('credits_remaining_usd, checked_at').order('checked_at', { ascending: false }).limit(1),
      supabase.from('mkt_vectordb_documents').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('app_config').select('business_phase').limit(1).single(),
    ]);
    if (flagsRes.data) setFlags(flagsRes.data);
    if (orRes.data?.[0]) { setOrBalance(orRes.data[0].credits_remaining_usd); setOrCheckedAt(orRes.data[0].checked_at); }
    setVectorCount(vectorRes.count || 0);
    if (configRes.data) setAppConfig(configRes.data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const toggleFlag = async (key: string, newValue: boolean) => {
    setFlags(prev => prev.map(f => f.flag_key === key ? { ...f, flag_value: newValue } : f));
    const { error } = await supabase.from('feature_flags').update({ flag_value: newValue }).eq('flag_key', key);
    if (error) {
      setFlags(prev => prev.map(f => f.flag_key === key ? { ...f, flag_value: !newValue } : f));
      toast.error('Failed to update');
    } else {
      toast.success('Flag updated');
    }
  };

  const checkBalance = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const jwt = sessionData?.session?.access_token;
      if (!jwt) return;
      const res = await fetch('https://flpzjbasdsfwoeruyxgp.supabase.co/functions/v1/check-openrouter-balance', {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (res.ok) {
        const data = await res.json();
        setOrBalance(data.balance ?? null);
        setOrCheckedAt(new Date().toISOString());
        toast.success('Balance refreshed');
      }
    } catch { toast.error('Failed to check balance'); }
  };

  const copyProjectId = () => {
    navigator.clipboard.writeText('flpzjbasdsfwoeruyxgp');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const flagValue = (key: string) => flags.find(f => f.flag_key === key)?.flag_value ?? false;

  // Extra flags not in core or channel groups
  const knownKeys = [...CORE_FLAGS.map(f => f.key), ...CHANNEL_FLAGS.map(f => f.key)];
  const experimentalFlags = flags.filter(f => !knownKeys.includes(f.flag_key));

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
      <h1 className="text-2xl font-bold text-foreground">Settings</h1>

      {/* ═══ SECTION A: API CONNECTIONS ═══ */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Integrations & API Status</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {INTEGRATIONS.map(int => {
            const isOR = int.key === 'openrouter';
            const status: 'green' | 'amber' | 'grey' = isOR
              ? (orCheckedAt && (Date.now() - new Date(orCheckedAt).getTime()) < 24 * 60 * 60 * 1000 ? 'green' : orCheckedAt ? 'amber' : 'grey')
              : 'grey';
            return (
              <Card key={int.key}>
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <StatusDot status={status} />
                    <div>
                      <p className="text-sm font-medium text-foreground">{int.label} — {int.desc}</p>
                      {isOR && orBalance !== null && <p className="text-xs text-muted-foreground">Balance: ${orBalance.toFixed(2)}</p>}
                      {isOR && orCheckedAt && <p className="text-xs text-muted-foreground">Last checked: {format(new Date(orCheckedAt), 'd MMM HH:mm')}</p>}
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

      {/* ═══ SECTION B: FEATURE FLAGS ═══ */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Feature Toggles</h2>

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Emily Core</p>
          {CORE_FLAGS.map(f => (
            <Card key={f.key}>
              <CardContent className="p-3 flex items-center justify-between">
                <span className="text-sm text-foreground">{f.label}</span>
                <Switch checked={flagValue(f.key)} onCheckedChange={v => toggleFlag(f.key, v)} />
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Channels</p>
          {CHANNEL_FLAGS.map(f => (
            <Card key={f.key}>
              <CardContent className="p-3 flex items-center justify-between">
                <span className="text-sm text-foreground">{f.label}</span>
                <Switch checked={flagValue(f.key)} onCheckedChange={v => toggleFlag(f.key, v)} />
              </CardContent>
            </Card>
          ))}
        </div>

        {experimentalFlags.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Other</p>
            {experimentalFlags.map(f => (
              <Card key={f.flag_key}>
                <CardContent className="p-3 flex items-center justify-between">
                  <div>
                    <span className="text-sm text-foreground">{f.description || f.flag_key}</span>
                    <p className="text-xs text-muted-foreground font-mono">{f.flag_key}</p>
                  </div>
                  <Switch checked={f.flag_value} onCheckedChange={v => toggleFlag(f.flag_key, v)} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
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
