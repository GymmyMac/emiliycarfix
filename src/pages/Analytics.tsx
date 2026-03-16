import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/hooks/use-toast';
import {
  Globe,
  Mail,
  Share2,
  Target,
  Users,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  Star,
  Facebook,
  Instagram,
  Linkedin,
  Music2,
  Plus,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts';

// ─── helpers ────────────────────────────────────────────────────
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

function pct(v: number | null | undefined) {
  if (v == null) return '0%';
  return `${(v * (v < 1 ? 100 : 1)).toFixed(1)}%`;
}

function pctVal(v: number | null | undefined) {
  if (v == null) return 0;
  return v < 1 ? v * 100 : v;
}

function nzd(v: number | null | undefined) {
  if (v == null) return '$0.00';
  return `$${Number(v).toFixed(2)}`;
}

function TrendArrow({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) return <span className="text-xs text-muted-foreground">—</span>;
  const up = current >= previous;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${up ? 'text-[#1A7A40]' : 'text-primary'}`}>
      {up ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
      {previous > 0 ? `${Math.abs(Math.round(((current - previous) / previous) * 100))}%` : 'new'}
    </span>
  );
}

function EmptyState() {
  return <p className="text-sm text-muted-foreground py-4">Data appears here once live.</p>;
}

function SectionHeader({ icon: Icon, label, accent }: { icon: React.ElementType; label: string; accent?: boolean }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon size={18} className={accent ? 'text-primary' : 'text-muted-foreground'} />
      <h2 className="text-lg font-semibold text-foreground">{label}</h2>
    </div>
  );
}

const PHASE_COLORS: Record<string, string> = {
  expose: '#CC2200',
  amplify: '#7A5500',
  position: '#1A7A40',
  tribe: '#1A3A8A',
};

const PLATFORM_ICONS: Record<string, React.ReactNode> = {
  facebook: <Facebook size={16} />,
  instagram: <Instagram size={16} />,
  tiktok: <Music2 size={16} />,
  linkedin: <Linkedin size={16} />,
};

const PLATFORM_COLORS: Record<string, string> = {
  facebook: '#1877F2',
  instagram: '#E4405F',
  tiktok: '#333333',
  linkedin: '#0A66C2',
};

// ─── main component ─────────────────────────────────────────────
export default function Analytics() {
  const [loading, setLoading] = useState(true);
  const [ga4, setGa4] = useState<{ current: any[]; previous: any[] }>({ current: [], previous: [] });
  const [emailStats, setEmailStats] = useState<any[]>([]);
  const [socialPosts, setSocialPosts] = useState<any[]>([]);
  const [socialAccounts, setSocialAccounts] = useState<any[]>([]);
  const [customerIntel, setCustomerIntel] = useState<any>(null);
  const [competitorAlerts, setCompetitorAlerts] = useState<any[]>([]);

  const fetchAll = useCallback(async () => {
    const today = daysAgo(0);
    const sevenAgo = daysAgo(7);
    const fourteenAgo = daysAgo(14);
    const thirtyAgo = daysAgo(30);

    const [
      ga4Current,
      ga4Previous,
      emailRes,
      socialPostRes,
      socialAccountRes,
      customerRes,
      competitorRes,
    ] = await Promise.all([
      supabase
        .from('mkt_ga4_daily_summary')
        .select('*')
        .gte('date', sevenAgo)
        .order('date', { ascending: false }),
      supabase
        .from('mkt_ga4_daily_summary')
        .select('*')
        .gte('date', fourteenAgo)
        .lt('date', sevenAgo)
        .order('date', { ascending: false }),
      supabase
        .from('mkt_mailchimp_campaign_stats')
        .select('*')
        .gte('send_date', thirtyAgo)
        .order('send_date', { ascending: false }),
      supabase
        .from('mkt_social_post_stats')
        .select('*')
        .gte('post_date', sevenAgo),
      supabase
        .from('mkt_social_account_weekly')
        .select('*')
        .order('week_of', { ascending: false })
        .limit(10),
      supabase
        .from('mkt_customer_intelligence_weekly')
        .select('*')
        .order('week_of', { ascending: false })
        .limit(1),
      supabase
        .from('mkt_competitor_intel')
        .select('*')
        .eq('carfix_response_needed', true)
        .eq('content_brief_generated', false),
    ]);

    setGa4({ current: ga4Current.data || [], previous: ga4Previous.data || [] });
    setEmailStats(emailRes.data || []);
    setSocialPosts(socialPostRes.data || []);
    setSocialAccounts(socialAccountRes.data || []);
    setCustomerIntel(customerRes.data?.[0] || null);
    setCompetitorAlerts(competitorRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ─── computed values ────────────────────
  const sumField = (arr: any[], field: string) =>
    arr.reduce((acc, r) => acc + (Number(r[field]) || 0), 0);

  // GA4
  const ga4Sessions = sumField(ga4.current, 'sessions');
  const ga4SessionsPrev = sumField(ga4.previous, 'sessions');
  const ga4Conversions = sumField(ga4.current, 'conversions');
  const ga4ConversionsPrev = sumField(ga4.previous, 'conversions');
  const ga4AiReferrals = sumField(ga4.current, 'ai_referral_sessions');
  const ga4AiReferralsPrev = sumField(ga4.previous, 'ai_referral_sessions');
  const ga4TopSource = ga4.current[0]?.top_traffic_source || '—';

  // Email
  const emailAvgOpen = emailStats.length > 0
    ? emailStats.reduce((a, r) => a + (Number(r.open_rate) || 0), 0) / emailStats.length
    : 0;
  const emailAvgClick = emailStats.length > 0
    ? emailStats.reduce((a, r) => a + (Number(r.click_rate) || 0), 0) / emailStats.length
    : 0;
  const bestEmail = emailStats.length > 0
    ? emailStats.reduce((best, r) => (Number(r.open_rate) || 0) > (Number(best.open_rate) || 0) ? r : best, emailStats[0])
    : null;
  const recentCampaigns = emailStats.slice(0, 5);

  // Social per platform
  const platforms = ['facebook', 'instagram', 'tiktok', 'linkedin'];
  const socialByPlatform = platforms.map((p) => {
    const posts = socialPosts.filter((s) => s.platform?.toLowerCase() === p);
    const views = sumField(posts, 'views');
    const engagements = sumField(posts, 'engagements');
    const engRate = views > 0 ? (engagements / views) * 100 : 0;
    const account = socialAccounts.find((a) => a.platform?.toLowerCase() === p);
    const followerChange = account?.follower_change ?? 0;
    return { platform: p, views, engRate, followerChange };
  });

  // Phase performance (last 30 days — use all socialPosts which is 7 days, but we need 30)
  // We'll fetch separately inline or reuse what we have
  const [phaseData, setPhaseData] = useState<{ phase: string; avgEngagement: number }[]>([]);
  useEffect(() => {
    async function fetchPhase() {
      const { data } = await supabase
        .from('mkt_social_post_stats')
        .select('psyops_phase, engagement_rate')
        .gte('post_date', daysAgo(30));
      if (data && data.length > 0) {
        const grouped: Record<string, number[]> = {};
        data.forEach((r) => {
          const phase = r.psyops_phase?.toLowerCase();
          if (phase) {
            if (!grouped[phase]) grouped[phase] = [];
            grouped[phase].push(Number(r.engagement_rate) || 0);
          }
        });
        const result = ['expose', 'amplify', 'position', 'tribe']
          .map((p) => ({
            phase: p.charAt(0).toUpperCase() + p.slice(1),
            avgEngagement: grouped[p]
              ? grouped[p].reduce((a, b) => a + b, 0) / grouped[p].length
              : 0,
          }));
        setPhaseData(result);
      }
    }
    fetchPhase();
  }, []);

  // ─── Add to Ideas Bucket ────────────────
  const handleAddToIdeas = async (query: string) => {
    const { error } = await supabase.from('mkt_ideas_bucket').insert({
      inbox_type: 'instant',
      raw_idea: `Content gap: customers searching for "${query}" — no results found`,
      status: 'raw',
    });
    if (!error) {
      toast({ title: 'Added to Ideas Bucket.', className: 'border-[#1A7A40] bg-[#1A7A40]/20 text-foreground' });
    }
  };

  // ─── Add competitor to queue ────────────
  const handleAddToQueue = async (alert: any) => {
    const { error } = await supabase.from('mkt_content_queue').insert({
      content_type: 'social_post',
      psyops_phase: 'expose',
      draft_copy: `Reactive content needed: ${alert.change_summary}`,
      status: 'pending',
      notes: `Triggered by competitor alert: ${alert.competitor}`,
    });
    if (!error) {
      setCompetitorAlerts((prev) => prev.filter((a) => a.id !== alert.id));
      toast({ title: 'Added to Content Queue.', className: 'border-[#1A7A40] bg-[#1A7A40]/20 text-foreground' });
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
        </div>
        <Skeleton className="h-48 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-foreground">Analytics</h1>

      {/* ═══ SECTION 1: WEBSITE ═══ */}
      <section>
        <SectionHeader icon={Globe} label="Website" />
        {ga4.current.length === 0 ? <EmptyState /> : (
          <div className="grid grid-cols-4 gap-4">
            <KpiCard title="Sessions" value={ga4Sessions.toLocaleString()}>
              <TrendArrow current={ga4Sessions} previous={ga4SessionsPrev} />
            </KpiCard>
            <KpiCard title="Conversions" value={ga4Conversions.toLocaleString()}>
              <TrendArrow current={ga4Conversions} previous={ga4ConversionsPrev} />
            </KpiCard>
            <KpiCard title="Top Traffic Source" value={ga4TopSource} />
            <KpiCard title="AI Referrals" value={ga4AiReferrals.toLocaleString()} icon={<Star size={14} className="text-[#7A5500]" />}>
              <TrendArrow current={ga4AiReferrals} previous={ga4AiReferralsPrev} />
            </KpiCard>
          </div>
        )}
      </section>

      <Separator />

      {/* ═══ SECTION 2: EMAIL ═══ */}
      <section>
        <SectionHeader icon={Mail} label="Email" />
        {emailStats.length === 0 ? <EmptyState /> : (
          <>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <KpiCard title="Avg Open Rate" value={pct(emailAvgOpen)} />
              <KpiCard title="Avg Click Rate" value={pct(emailAvgClick)} />
              <KpiCard title="Best Subject Line" value={bestEmail?.subject_line || '—'}>
                {bestEmail && (
                  <span className="text-xs text-muted-foreground">{pct(bestEmail.open_rate)} open rate</span>
                )}
              </KpiCard>
            </div>
            {recentCampaigns.length > 0 && (
              <Card className="border-border bg-card">
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wide">
                        <th className="px-4 py-3">Subject</th>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Opens</th>
                        <th className="px-4 py-3">Clicks</th>
                        <th className="px-4 py-3">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentCampaigns.map((c, i) => (
                        <tr key={i} className="border-b border-border last:border-0">
                          <td className="px-4 py-3 text-foreground">{c.subject_line || '—'}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {c.send_date ? new Date(c.send_date).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' }) : '—'}
                          </td>
                          <td className="px-4 py-3 text-foreground">{pct(c.open_rate)}</td>
                          <td className="px-4 py-3 text-foreground">{pct(c.click_rate)}</td>
                          <td className="px-4 py-3 text-foreground">{nzd(c.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </section>

      <Separator />

      {/* ═══ SECTION 3: SOCIAL ═══ */}
      <section>
        <SectionHeader icon={Share2} label="Social" />
        {socialPosts.length === 0 && socialAccounts.length === 0 ? <EmptyState /> : (
          <div className="grid grid-cols-4 gap-4">
            {socialByPlatform.map((s) => {
              const engBg = s.engRate > 3 ? 'bg-[#1A7A40]/20 text-[#1A7A40]' : s.engRate >= 1 ? 'bg-[#7A5500]/20 text-[#7A5500]' : 'bg-primary/20 text-primary';
              return (
                <Card key={s.platform} className="border-border bg-card">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2" style={{ color: PLATFORM_COLORS[s.platform] }}>
                      {PLATFORM_ICONS[s.platform]}
                      <span className="text-sm font-medium capitalize">{s.platform}</span>
                    </div>
                    <p className="text-xl font-semibold text-foreground">{s.views.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">views</span></p>
                    <div className="flex items-center justify-between">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${engBg}`}>
                        {s.engRate.toFixed(1)}% eng
                      </span>
                      <span className={`text-xs font-medium ${s.followerChange >= 0 ? 'text-[#1A7A40]' : 'text-primary'}`}>
                        {s.followerChange >= 0 ? '+' : ''}{s.followerChange}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <Separator />

      {/* ═══ SECTION 4: PSYOPS PHASE PERFORMANCE ═══ */}
      <section>
        <SectionHeader icon={Target} label="Phase Performance" accent />
        <p className="text-xs text-muted-foreground mb-4 -mt-2">Average engagement rate by PSYOPS phase — last 30 days</p>
        {phaseData.length === 0 || phaseData.every((d) => d.avgEngagement === 0) ? <EmptyState /> : (
          <Card className="border-border bg-card p-6">
            <CardContent className="p-0 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={phaseData} layout="vertical" margin={{ left: 10, right: 40, top: 0, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="phase"
                    tick={{ fill: 'hsl(0 0% 55%)', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    width={80}
                  />
                  <RechartsTooltip
                    contentStyle={{ background: 'hsl(0 0% 14.5%)', border: '1px solid hsl(0 0% 16.5%)', borderRadius: 6, color: '#fff', fontSize: 12 }}
                    formatter={(value: number) => [`${value.toFixed(2)}%`, 'Avg Engagement']}
                  />
                  <Bar dataKey="avgEngagement" radius={[0, 4, 4, 0]} barSize={28}>
                    {phaseData.map((entry) => (
                      <Cell key={entry.phase} fill={PHASE_COLORS[entry.phase.toLowerCase()] || '#666'} />
                    ))}
                    <LabelList
                      dataKey="avgEngagement"
                      position="right"
                      formatter={(v: number) => `${v.toFixed(2)}%`}
                      style={{ fill: 'hsl(0 0% 55%)', fontSize: 11 }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </section>

      <Separator />

      {/* ═══ SECTION 5: CUSTOMER SIGNALS ═══ */}
      <section>
        <SectionHeader icon={Users} label="Customer Signals" />
        {!customerIntel ? <EmptyState /> : (
          <>
            <div className="grid grid-cols-4 gap-4 mb-4">
              <KpiCard title="Repeat Purchase Rate" value={pct(customerIntel.repeat_purchase_rate)} />
              <KpiCard title="Avg Order Value" value={nzd(customerIntel.avg_order_value)} />
              <KpiCard title="Top Vehicle" value={customerIntel.top_vehicle_make_1 || '—'} />
              <KpiCard title="BoB Capture Rate" value={pct(customerIntel.bob_to_purchase_rate)} />
            </div>
            {customerIntel.top_zero_result_query && (
              <Card className="border-primary/40 bg-primary/10">
                <CardContent className="p-4 flex items-center justify-between">
                  <p className="text-sm text-foreground">
                    Content opportunity: customers searched for{' '}
                    <span className="font-semibold">"{customerIntel.top_zero_result_query}"</span>{' '}
                    and found nothing.
                  </p>
                  <Button
                    size="sm"
                    onClick={() => handleAddToIdeas(customerIntel.top_zero_result_query)}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground shrink-0"
                  >
                    <Plus size={14} className="mr-1" /> Add to Ideas Bucket
                  </Button>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </section>

      <Separator />

      {/* ═══ SECTION 6: COMPETITOR ALERTS ═══ */}
      <section>
        <SectionHeader icon={AlertTriangle} label="Competitor Alerts" />
        {competitorAlerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No competitor alerts.</p>
        ) : (
          <div className="space-y-3">
            {competitorAlerts.map((alert) => (
              <Card key={alert.id} className="border-[#7A5500]/40 bg-[#7A5500]/10">
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="space-y-1 flex-1">
                    <p className="text-sm font-semibold text-foreground">{alert.competitor}</p>
                    <p className="text-sm text-foreground/80">{alert.change_summary}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {alert.detected_at ? new Date(alert.detected_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleAddToQueue(alert)}
                    className="bg-[#7A5500] hover:bg-[#7A5500]/80 text-white shrink-0"
                  >
                    <Plus size={14} className="mr-1" /> Add to Queue
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── shared KPI card ────────────────────────────────────────────
function KpiCard({
  title,
  value,
  icon,
  children,
}: {
  title: string;
  value: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4 space-y-1">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {icon}
          {title}
        </div>
        <p className="text-xl font-semibold text-foreground truncate">{value}</p>
        {children}
      </CardContent>
    </Card>
  );
}
