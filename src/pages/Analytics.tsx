import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import {
  Globe, Mail, Share2, Target, Users, AlertTriangle,
  ArrowUp, ArrowDown, Star, Facebook, Instagram, Linkedin, Music2, Plus,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, Cell, LabelList,
} from 'recharts';

function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0]; }
function pct(v: number | null | undefined) { if (v == null) return '0%'; return `${(v * (v < 1 ? 100 : 1)).toFixed(1)}%`; }
function pctVal(v: number | null | undefined) { if (v == null) return 0; return v < 1 ? v * 100 : v; }
function nzd(v: number | null | undefined) { if (v == null) return '$0.00'; return `$${Number(v).toFixed(2)}`; }

function TrendArrow({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) return <span className="text-xs text-muted-foreground">—</span>;
  const up = current >= previous;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${up ? 'text-success' : 'text-destructive'}`}>
      {up ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
      {previous > 0 ? `${Math.abs(Math.round(((current - previous) / previous) * 100))}%` : 'new'}
    </span>
  );
}

function EmptyState() { return <p className="text-sm text-muted-foreground py-4">Data appears here once live.</p>; }

function SectionHeader({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon size={18} className="text-primary" />
      <h2 className="font-display text-lg text-foreground">{label}</h2>
    </div>
  );
}

const PHASE_COLORS: Record<string, string> = { expose: '#EF4444', amplify: '#FF8C00', position: '#22C55E', tribe: '#0052CC' };
const PLATFORM_ICONS: Record<string, React.ReactNode> = { facebook: <Facebook size={16} />, instagram: <Instagram size={16} />, tiktok: <Music2 size={16} />, linkedin: <Linkedin size={16} /> };
const PLATFORM_COLORS: Record<string, string> = { facebook: '#1877F2', instagram: '#E1306C', tiktok: '#333333', linkedin: '#0A66C2' };

export default function Analytics() {
  const [loading, setLoading] = useState(true);
  const [ga4, setGa4] = useState<{ current: any[]; previous: any[] }>({ current: [], previous: [] });
  const [emailStats, setEmailStats] = useState<any[]>([]);
  const [socialPosts, setSocialPosts] = useState<any[]>([]);
  const [socialAccounts, setSocialAccounts] = useState<any[]>([]);
  const [customerIntel, setCustomerIntel] = useState<any>(null);
  const [competitorAlerts, setCompetitorAlerts] = useState<any[]>([]);
  const [phaseData, setPhaseData] = useState<{ phase: string; avgEngagement: number }[]>([]);

  const fetchAll = useCallback(async () => {
    const sevenAgo = daysAgo(7); const fourteenAgo = daysAgo(14); const thirtyAgo = daysAgo(30);
    const [ga4Current, ga4Previous, emailRes, socialPostRes, socialAccountRes, customerRes, competitorRes] = await Promise.all([
      supabase.from('mkt_ga4_daily_summary').select('*').gte('date', sevenAgo).order('date', { ascending: false }),
      supabase.from('mkt_ga4_daily_summary').select('*').gte('date', fourteenAgo).lt('date', sevenAgo).order('date', { ascending: false }),
      supabase.from('mkt_mailchimp_campaign_stats').select('*').gte('send_date', thirtyAgo).order('send_date', { ascending: false }),
      supabase.from('mkt_social_post_stats').select('*').gte('post_date', sevenAgo),
      supabase.from('mkt_social_account_weekly').select('*').order('week_of', { ascending: false }).limit(10),
      supabase.from('mkt_customer_intelligence_weekly').select('*').order('week_of', { ascending: false }).limit(1),
      supabase.from('mkt_competitor_intel').select('*').eq('carfix_response_needed', true).eq('content_brief_generated', false),
    ]);
    setGa4({ current: ga4Current.data || [], previous: ga4Previous.data || [] });
    setEmailStats(emailRes.data || []);
    setSocialPosts(socialPostRes.data || []);
    setSocialAccounts(socialAccountRes.data || []);
    setCustomerIntel(customerRes.data?.[0] || null);
    setCompetitorAlerts(competitorRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    async function fetchPhase() {
      const { data } = await supabase.from('mkt_social_post_stats').select('psyops_phase, engagement_rate').gte('post_date', daysAgo(30));
      if (data && data.length > 0) {
        const grouped: Record<string, number[]> = {};
        data.forEach((r) => { const p = r.psyops_phase?.toLowerCase(); if (p) { if (!grouped[p]) grouped[p] = []; grouped[p].push(Number(r.engagement_rate) || 0); } });
        setPhaseData(['expose', 'amplify', 'position', 'tribe'].map((p) => ({
          phase: p.charAt(0).toUpperCase() + p.slice(1),
          avgEngagement: grouped[p] ? grouped[p].reduce((a, b) => a + b, 0) / grouped[p].length : 0,
        })));
      }
    }
    fetchPhase();
  }, []);

  const sumField = (arr: any[], field: string) => arr.reduce((acc, r) => acc + (Number(r[field]) || 0), 0);
  const ga4Sessions = sumField(ga4.current, 'sessions'); const ga4SessionsPrev = sumField(ga4.previous, 'sessions');
  const ga4Conversions = sumField(ga4.current, 'conversions'); const ga4ConversionsPrev = sumField(ga4.previous, 'conversions');
  const ga4AiReferrals = sumField(ga4.current, 'ai_referral_sessions'); const ga4AiReferralsPrev = sumField(ga4.previous, 'ai_referral_sessions');
  const ga4TopSource = ga4.current[0]?.top_traffic_source || '—';
  const emailAvgOpen = emailStats.length > 0 ? emailStats.reduce((a, r) => a + (Number(r.open_rate) || 0), 0) / emailStats.length : 0;
  const emailAvgClick = emailStats.length > 0 ? emailStats.reduce((a, r) => a + (Number(r.click_rate) || 0), 0) / emailStats.length : 0;
  const bestEmail = emailStats.length > 0 ? emailStats.reduce((best, r) => (Number(r.open_rate) || 0) > (Number(best.open_rate) || 0) ? r : best, emailStats[0]) : null;
  const recentCampaigns = emailStats.slice(0, 5);
  const platforms = ['facebook', 'instagram', 'tiktok', 'linkedin'];
  const socialByPlatform = platforms.map((p) => {
    const posts = socialPosts.filter((s) => s.platform?.toLowerCase() === p);
    const views = sumField(posts, 'views'); const engagements = sumField(posts, 'engagements');
    const engRate = views > 0 ? (engagements / views) * 100 : 0;
    const account = socialAccounts.find((a) => a.platform?.toLowerCase() === p);
    return { platform: p, views, engRate, followerChange: account?.follower_change ?? 0 };
  });

  const handleAddToIdeas = async (query: string) => {
    const { error } = await supabase.from('mkt_ideas_bucket').insert({ inbox_type: 'instant', raw_idea: `Content gap: customers searching for "${query}" — no results found`, status: 'raw' });
    if (!error) toast({ title: 'Added to Ideas Bucket.' });
  };

  const handleAddToQueue = async (alert: any) => {
    const { error } = await supabase.from('mkt_content_queue').insert({ content_type: 'social_post', psyops_phase: 'expose', draft_copy: `Reactive content needed: ${alert.change_summary}`, status: 'pending', notes: `Triggered by competitor alert: ${alert.competitor}` });
    if (!error) { setCompetitorAlerts((prev) => prev.filter((a) => a.id !== alert.id)); toast({ title: 'Added to Content Queue.' }); }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="font-display text-2xl text-foreground">Analytics</h1>

      {/* WEBSITE */}
      <section>
        <SectionHeader icon={Globe} label="Website" />
        {ga4.current.length === 0 ? <EmptyState /> : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard title="Sessions" value={ga4Sessions.toLocaleString()}><TrendArrow current={ga4Sessions} previous={ga4SessionsPrev} /></KpiCard>
            <KpiCard title="Conversions" value={ga4Conversions.toLocaleString()}><TrendArrow current={ga4Conversions} previous={ga4ConversionsPrev} /></KpiCard>
            <KpiCard title="Top Source" value={ga4TopSource} />
            <KpiCard title="AI Referrals" value={ga4AiReferrals.toLocaleString()} icon={<Star size={14} className="text-orange" />}><TrendArrow current={ga4AiReferrals} previous={ga4AiReferralsPrev} /></KpiCard>
          </div>
        )}
      </section>

      <div className="border-t border-border" />

      {/* EMAIL */}
      <section>
        <SectionHeader icon={Mail} label="Email" />
        {emailStats.length === 0 ? <EmptyState /> : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
              <KpiCard title="Avg Open Rate" value={pct(emailAvgOpen)} />
              <KpiCard title="Avg Click Rate" value={pct(emailAvgClick)} />
              <KpiCard title="Best Subject" value={bestEmail?.subject_line || '—'}>{bestEmail && <span className="text-xs text-muted-foreground">{pct(bestEmail.open_rate)} open</span>}</KpiCard>
            </div>
            {recentCampaigns.length > 0 && (
              <div className="space-y-2 md:hidden">
                {recentCampaigns.map((c, i) => (
                  <Card key={i} className="rounded-xl border border-border bg-card shadow-sm">
                    <CardContent className="p-3 space-y-1">
                      <p className="text-sm font-medium text-foreground">{c.subject_line || '—'}</p>
                      <div className="flex gap-3 text-xs text-muted-foreground">
                        <span>{c.send_date ? new Date(c.send_date).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' }) : '—'}</span>
                        <span>Opens: {pct(c.open_rate)}</span>
                        <span>Revenue: {nzd(c.revenue)}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
            {recentCampaigns.length > 0 && (
              <Card className="rounded-xl border border-border bg-card shadow-sm hidden md:block">
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wide">
                      <th className="px-4 py-3">Subject</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Opens</th><th className="px-4 py-3">Clicks</th><th className="px-4 py-3">Revenue</th>
                    </tr></thead>
                    <tbody>{recentCampaigns.map((c, i) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 text-foreground">{c.subject_line || '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground">{c.send_date ? new Date(c.send_date).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' }) : '—'}</td>
                        <td className="px-4 py-3">{pct(c.open_rate)}</td><td className="px-4 py-3">{pct(c.click_rate)}</td><td className="px-4 py-3">{nzd(c.revenue)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </section>

      <div className="border-t border-border" />

      {/* SOCIAL */}
      <section>
        <SectionHeader icon={Share2} label="Social" />
        {socialPosts.length === 0 && socialAccounts.length === 0 ? <EmptyState /> : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {socialByPlatform.map((s) => {
              const engBg = s.engRate > 3 ? 'bg-success/10 text-success' : s.engRate >= 1 ? 'bg-orange/10 text-orange' : 'bg-destructive/10 text-destructive';
              return (
                <Card key={s.platform} className="rounded-xl border border-border bg-card shadow-sm">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center gap-2" style={{ color: PLATFORM_COLORS[s.platform] }}>{PLATFORM_ICONS[s.platform]}<span className="text-sm font-medium capitalize">{s.platform}</span></div>
                    <p className="text-xl font-semibold text-foreground">{s.views.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">views</span></p>
                    <div className="flex items-center justify-between">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${engBg}`}>{s.engRate.toFixed(1)}% eng</span>
                      <span className={`text-xs font-medium ${s.followerChange >= 0 ? 'text-success' : 'text-destructive'}`}>{s.followerChange >= 0 ? '+' : ''}{s.followerChange}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <div className="border-t border-border" />

      {/* PHASE PERFORMANCE */}
      <section>
        <SectionHeader icon={Target} label="Phase Performance" />
        <p className="text-xs text-muted-foreground mb-4 -mt-2">Average engagement rate by PSYOPS phase — last 30 days</p>
        {phaseData.length === 0 || phaseData.every((d) => d.avgEngagement === 0) ? <EmptyState /> : (
          <Card className="rounded-xl border border-border bg-card shadow-sm p-4 overflow-x-auto">
            <CardContent className="p-0 h-56 min-w-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={phaseData} layout="vertical" margin={{ left: 10, right: 40, top: 0, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="phase" tick={{ fill: '#64748B', fontSize: 12 }} axisLine={false} tickLine={false} width={80} />
                  <RechartsTooltip contentStyle={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, color: '#0F172A', fontSize: 12 }} formatter={(value: number) => [`${value.toFixed(2)}%`, 'Avg Engagement']} />
                  <Bar dataKey="avgEngagement" radius={[0, 6, 6, 0]} barSize={28}>
                    {phaseData.map((entry) => <Cell key={entry.phase} fill={PHASE_COLORS[entry.phase.toLowerCase()] || '#64748B'} />)}
                    <LabelList dataKey="avgEngagement" position="right" formatter={(v: number) => `${v.toFixed(2)}%`} style={{ fill: '#64748B', fontSize: 11 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </section>

      <div className="border-t border-border" />

      {/* CUSTOMER SIGNALS */}
      <section>
        <SectionHeader icon={Users} label="Customer Signals" />
        {!customerIntel ? <EmptyState /> : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <KpiCard title="Repeat Purchase" value={pct(customerIntel.repeat_purchase_rate)} />
              <KpiCard title="Avg Order Value" value={nzd(customerIntel.avg_order_value)} />
              <KpiCard title="Top Vehicle" value={customerIntel.top_vehicle_make_1 || '—'} />
              <KpiCard title="BoB Capture" value={pct(customerIntel.bob_to_purchase_rate)} />
            </div>
            {customerIntel.top_zero_result_query && (
              <Card className="rounded-xl border border-orange/30 bg-orange/5 shadow-sm">
                <CardContent className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                  <p className="text-sm text-foreground">Content opportunity: <span className="font-semibold">"{customerIntel.top_zero_result_query}"</span> — no results found.</p>
                  <Button size="sm" onClick={() => handleAddToIdeas(customerIntel.top_zero_result_query)} className="h-11 md:h-9 w-full md:w-auto shrink-0">
                    <Plus size={14} className="mr-1" /> Add to Ideas
                  </Button>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </section>

      <div className="border-t border-border" />

      {/* COMPETITOR ALERTS */}
      <section>
        <SectionHeader icon={AlertTriangle} label="Competitor Alerts" />
        {competitorAlerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No competitor alerts.</p>
        ) : (
          <div className="space-y-3">
            {competitorAlerts.map((alert) => (
              <Card key={alert.id} className="rounded-xl border border-orange/30 bg-orange/5 shadow-sm">
                <CardContent className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                  <div className="space-y-1 flex-1">
                    <p className="text-sm font-semibold text-foreground">{alert.competitor}</p>
                    <p className="text-sm text-foreground/80">{alert.change_summary}</p>
                    <p className="text-[11px] text-muted-foreground">{alert.detected_at ? new Date(alert.detected_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</p>
                  </div>
                  <Button size="sm" onClick={() => handleAddToQueue(alert)} className="h-11 md:h-9 w-full md:w-auto shrink-0">
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

function KpiCard({ title, value, icon, children }: { title: string; value: string; icon?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <Card className="rounded-xl border border-border bg-card shadow-sm">
      <CardContent className="p-4 space-y-1">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{title}</div>
        <p className="text-xl font-semibold text-foreground truncate">{value}</p>
        {children}
      </CardContent>
    </Card>
  );
}
