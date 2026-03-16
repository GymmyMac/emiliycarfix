import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Activity } from 'lucide-react';

// ─── helpers ────────────────────────────────────────────────────
function timeAgo(dateStr: string | null) {
  if (!dateStr) return 'Never run';
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hours ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

function StatusDot({ status }: { status: 'green' | 'amber' | 'red' }) {
  const colors = {
    green: 'bg-[#1A7A40]',
    amber: 'bg-[#7A5500]',
    red: 'bg-primary',
  };
  return <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${colors[status]}`} />;
}

function scriptStatus(runAt: string | null): 'green' | 'amber' | 'red' {
  if (!runAt) return 'red';
  const hoursAgo = (Date.now() - new Date(runAt).getTime()) / 3600000;
  if (hoursAgo < 26) return 'green';
  if (hoursAgo < 48) return 'amber';
  return 'red';
}

const WORKFLOW_NAMES = [
  'collect_buffer_stats',
  'collect_tiktok_stats',
  'collect_ga4_stats',
  'collect_mailchimp_stats',
  'collect_customer_intelligence',
  'collect_market_pricing',
  'daily-brief',
];

const API_KEYS = [
  { service: 'Claude API', key: 'ANTHROPIC_API_KEY' },
  { service: 'OpenRouter', key: 'OPENROUTER_API_KEY' },
  { service: 'Buffer', key: 'BUFFER_ACCESS_TOKEN' },
  { service: 'Mailchimp', key: 'MAILCHIMP_API_KEY' },
  { service: 'Telegram', key: 'TELEGRAM_BOT_TOKEN' },
  { service: '11Labs', key: 'ELEVENLABS_API_KEY' },
  { service: 'GA4', key: 'GA4_SERVICE_ACCOUNT_JSON' },
  { service: 'TikTok', key: 'TIKTOK_ACCESS_TOKEN' },
  { service: 'TradeMe', key: 'TRADEME_API_KEY' },
  { service: 'SerpAPI', key: 'SERPAPI_KEY' },
  { service: 'PageCrawl', key: 'PAGECRAWL_WEBHOOK_SECRET' },
];

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [lastBrief, setLastBrief] = useState<string | null>(null);
  const [itemsToday, setItemsToday] = useState(0);
  const [vectorCount, setVectorCount] = useState(0);
  const [bobConvos, setBobConvos] = useState(0);
  const [scriptLogs, setScriptLogs] = useState<Record<string, string | null>>({});
  const [apiStatus, setApiStatus] = useState<Record<string, boolean>>({});

  const fetchData = useCallback(async () => {
    const today = new Date().toISOString().split('T')[0];

    const [briefRes, itemsRes, vectorRes, bobRes, ...scriptResults] = await Promise.all([
      supabase
        .from('mkt_scheduler_log')
        .select('run_at')
        .eq('workflow_name', 'daily-brief')
        .order('run_at', { ascending: false })
        .limit(1),
      supabase
        .from('mkt_content_queue')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', `${today}T00:00:00`)
        .lte('created_at', `${today}T23:59:59`),
      supabase
        .from('mkt_vectordb_documents')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active'),
      supabase
        .from('mkt_bot_conversations')
        .select('*', { count: 'exact', head: true })
        .eq('bot_type', 'bob')
        .gte('created_at', `${today}T00:00:00`)
        .lte('created_at', `${today}T23:59:59`),
      ...WORKFLOW_NAMES.map((wf) =>
        supabase
          .from('mkt_scheduler_log')
          .select('run_at, workflow_name')
          .eq('workflow_name', wf)
          .order('run_at', { ascending: false })
          .limit(1)
      ),
    ]);

    setLastBrief(briefRes.data?.[0]?.run_at || null);
    setItemsToday(itemsRes.count || 0);
    setVectorCount(vectorRes.count || 0);
    setBobConvos(bobRes.count || 0);

    const logs: Record<string, string | null> = {};
    WORKFLOW_NAMES.forEach((wf, i) => {
      const result = scriptResults[i];
      logs[wf] = result.data?.[0]?.run_at || null;
    });
    setScriptLogs(logs);

    // API key status — we can't read Supabase secrets from client.
    // Show all as "Unknown" with a note. If an edge function exists to check, use it.
    // For now, mark all as unknown/unchecked.
    const status: Record<string, boolean> = {};
    API_KEYS.forEach((k) => { status[k.key] = false; });

    // Try calling a status-check edge function if it exists
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const jwt = sessionData?.session?.access_token;
      if (jwt) {
        const res = await fetch(
          'https://flpzjbasdsfwoeruyxgp.supabase.co/functions/v1/check-secrets',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${jwt}`,
            },
            body: JSON.stringify({ keys: API_KEYS.map((k) => k.key) }),
          }
        );
        if (res.ok) {
          const data = await res.json();
          if (data.results) {
            Object.entries(data.results).forEach(([key, exists]) => {
              status[key] = exists as boolean;
            });
          }
        }
      }
    } catch {
      // Edge function doesn't exist yet — all show as unchecked
    }

    setApiStatus(status);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const briefHoursAgo = lastBrief
    ? (Date.now() - new Date(lastBrief).getTime()) / 3600000
    : Infinity;

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-40 rounded-lg" />
          <Skeleton className="h-40 rounded-lg" />
        </div>
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-foreground">Settings</h1>

      {/* ═══ SECTION 1: SYSTEM STATUS ═══ */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Activity size={18} className="text-muted-foreground" />
          <h2 className="text-lg font-semibold text-foreground">System Status</h2>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* Emily Status */}
          <Card className="border-border bg-card">
            <CardContent className="p-5 space-y-3">
              <h3 className="text-sm font-semibold text-emily">Emily</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <StatusDot status={briefHoursAgo < 25 ? 'green' : 'red'} />
                  <span className="text-foreground">Last run: {timeAgo(lastBrief)}</span>
                </div>
                <p className="text-muted-foreground">{itemsToday} items generated today</p>
                <p className="text-muted-foreground">{vectorCount} documents loaded</p>
              </div>
            </CardContent>
          </Card>

          {/* Bob Status */}
          <Card className="border-border bg-card">
            <CardContent className="p-5 space-y-3">
              <h3 className="text-sm font-semibold text-primary">Bob</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <StatusDot status={bobConvos > 0 ? 'green' : 'amber'} />
                  <span className="text-foreground">{bobConvos} conversations today</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Automation Scripts Table */}
        <Card className="border-border bg-card">
          <CardContent className="p-0">
            <div className="px-5 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">Automation Scripts</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="px-5 py-2.5">Script</th>
                  <th className="px-5 py-2.5">Last Run</th>
                  <th className="px-5 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {WORKFLOW_NAMES.map((wf) => {
                  const runAt = scriptLogs[wf] || null;
                  const status = scriptStatus(runAt);
                  return (
                    <tr key={wf} className="border-b border-border last:border-0">
                      <td className="px-5 py-2.5 font-mono text-foreground text-xs">{wf}</td>
                      <td className="px-5 py-2.5 text-muted-foreground">{timeAgo(runAt)}</td>
                      <td className="px-5 py-2.5">
                        <StatusDot status={status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      <Separator />

      {/* ═══ SECTION 2: API CONFIGURATION ═══ */}
      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-foreground">API Configuration</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Keys are stored securely in Supabase secrets. Values are not displayed.
          </p>
        </div>

        <Card className="border-border bg-card">
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="px-5 py-2.5">Service</th>
                  <th className="px-5 py-2.5">Key Name</th>
                  <th className="px-5 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {API_KEYS.map((row) => {
                  const configured = apiStatus[row.key];
                  return (
                    <tr key={row.key} className="border-b border-border last:border-0">
                      <td className="px-5 py-2.5 text-foreground">{row.service}</td>
                      <td className="px-5 py-2.5 font-mono text-xs text-muted-foreground">{row.key}</td>
                      <td className="px-5 py-2.5">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            configured
                              ? 'bg-[#1A7A40]/20 text-[#1A7A40]'
                              : 'bg-primary/20 text-primary'
                          }`}
                        >
                          {configured ? 'Configured' : 'Missing'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground mt-3">
          To add or update API keys, go to your Supabase project → Settings → Edge Functions → Secrets.
        </p>
      </section>
    </div>
  );
}
