import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import {
  Play, ExternalLink, Search, CheckCircle2, XCircle, AlertTriangle,
  Film, Eye, EyeOff, Trash2, ChevronLeft, ChevronRight, Loader2, Plus,
  ChevronDown, ChevronUp, Flag,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import PageHeader from '@/components/PageHeader';

/* ─── Types ─── */
interface Video {
  id: string;
  youtube_id: string;
  title: string;
  channel_name: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  composite_score: number | null;
  is_active: boolean;
  flagged: boolean;
  flagged_reason: string | null;
  view_count: number | null;
  like_count: number | null;
  published_at: string | null;
  created_at: string;
  // joined
  job_type?: string | null;
  vehicle_count?: number;
}

interface Report {
  id: string;
  video_id: string;
  report_source: string | null;
  report_reason: string | null;
  report_notes: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  action_taken: string | null;
  created_at: string;
  // joined video
  video_title?: string;
  video_thumbnail?: string;
  video_youtube_id?: string;
}

interface FetchedMeta {
  youtube_id: string;
  title: string;
  description: string;
  channel_id: string;
  channel_name: string;
  channel_subscriber_count: number;
  duration_seconds: number;
  published_at: string;
  thumbnail_url: string;
  view_count: number;
  like_count: number;
  comment_count: number;
  already_exists: boolean;
}

const STREAM_BADGE: Record<string, string> = {
  disrupt: 'bg-stream-disrupt/20 text-stream-disrupt',
  educate: 'bg-stream-educate/20 text-stream-educate',
  convert: 'bg-stream-convert/20 text-stream-convert',
  amplify: 'bg-stream-amplify/20 text-stream-amplify',
};

const JOB_TYPES = [
  'Brake Pad Replacement', 'Brake Rotor Replacement', 'Brake Caliper Replacement',
  'Shock Absorber Replacement', 'Coil Spring Replacement', 'Control Arm Replacement',
  'CV Joint Replacement', 'Timing Belt Replacement', 'Water Pump Replacement',
  'Alternator Replacement', 'Starter Motor Replacement', 'Radiator Replacement',
  'Thermostat Replacement', 'Air Filter Replacement', 'Oil Change',
  'Spark Plug Replacement', 'Wiper Blade Replacement',
];

const PAGE_SIZE = 25;

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function ScorePill({ score }: { score: number | null }) {
  if (score === null || score === undefined) return <span className="text-muted-foreground text-xs">—</span>;
  const color = score >= 70 ? 'bg-emerald-500/20 text-emerald-400' : score >= 40 ? 'bg-amber-500/20 text-amber-400' : 'bg-destructive/20 text-destructive';
  return <Badge variant="outline" className={`${color} border-transparent text-[11px] font-semibold`}>{score}</Badge>;
}

function StatusBadge({ isActive, flagged }: { isActive: boolean; flagged: boolean }) {
  if (flagged) return <Badge variant="outline" className="bg-amber-500/20 text-amber-400 border-transparent text-[11px]">Flagged</Badge>;
  if (isActive) return <Badge variant="outline" className="bg-emerald-500/20 text-emerald-400 border-transparent text-[11px]">Active</Badge>;
  return <Badge variant="outline" className="bg-muted/40 text-muted-foreground border-transparent text-[11px]">Inactive</Badge>;
}

/* ═══════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════ */
export default function Videos() {
  const [tab, setTab] = useState('library');

  return (
    <div className="space-y-6">
      <PageHeader title="Fitting Guides" description="YouTube how-to videos by vehicle — manage the library, review reports, and add new guides." />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-secondary/60">
          <TabsTrigger value="library">Library</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="add">Add Video</TabsTrigger>
        </TabsList>

        <TabsContent value="library"><LibraryTab /></TabsContent>
        <TabsContent value="reports"><ReportsTab /></TabsContent>
        <TabsContent value="add"><AddVideoTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   TAB 1 — LIBRARY (Vehicle → Part Slot hierarchy)
   ═══════════════════════════════════════════════ */
interface VehicleGroup {
  vehicle_id: string;
  make: string;
  model: string;
  year_from: number | null;
  year_to: number | null;
  label: string;
  slots: Record<string, VideoEntry[]>;
  totalVideos: number;
}

interface VideoEntry {
  id: string;
  youtube_id: string;
  title: string;
  channel_name: string | null;
  thumbnail_url: string | null;
  composite_score: number | null;
  is_active: boolean;
  flagged: boolean;
  job_type: string;
}

function LibraryTab() {
  const [groups, setGroups] = useState<VehicleGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confirmDialog, setConfirmDialog] = useState<{ type: 'disable' | 'enable' | 'remove' | 'flag'; video: VideoEntry } | null>(null);
  const [summaryStats, setSummaryStats] = useState({ vehicles: 0, slots: 0, videos: 0 });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Get all vehicle-video associations with video + vehicle data
      const { data: vvData, error: vvErr } = await supabase
        .from('youtube_video_vehicles')
        .select('vehicle_id, video_id, youtube_videos!inner(id, youtube_id, title, channel_name, thumbnail_url, composite_score, is_active, flagged)');
      if (vvErr) throw vvErr;

      // Get vehicle details
      const vehicleIds = [...new Set((vvData || []).map((r: any) => r.vehicle_id))];
      let vehicleMap: Record<string, { make: string; model: string; year_from: number | null; year_to: number | null }> = {};
      if (vehicleIds.length) {
        const { data: vehData } = await supabase.from('vehicle').select('id, make, model, year_from, year_to').in('id', vehicleIds);
        if (vehData) {
          vehData.forEach((v: any) => { vehicleMap[v.id] = { make: v.make, model: v.model, year_from: v.year_from, year_to: v.year_to }; });
        }
      }

      // Get job mappings for all videos
      const videoIds = [...new Set((vvData || []).map((r: any) => r.video_id))];
      let jobMap: Record<string, string> = {};
      if (videoIds.length) {
        const { data: jmData } = await supabase.from('youtube_job_mappings').select('video_id, job_type').in('video_id', videoIds);
        if (jmData) {
          jmData.forEach((r: any) => { if (!jobMap[r.video_id]) jobMap[r.video_id] = r.job_type; });
        }
      }

      // Build vehicle groups
      const groupMap: Record<string, VehicleGroup> = {};
      (vvData || []).forEach((row: any) => {
        const vid = row.vehicle_id;
        const veh = vehicleMap[vid];
        if (!veh) return;
        const video = row.youtube_videos;
        if (!video) return;
        const jobType = jobMap[video.id] || 'General';

        if (!groupMap[vid]) {
          const yearRange = veh.year_from && veh.year_to ? `${veh.year_from}–${veh.year_to}` : veh.year_from ? `${veh.year_from}+` : '';
          groupMap[vid] = {
            vehicle_id: vid,
            make: veh.make,
            model: veh.model,
            year_from: veh.year_from,
            year_to: veh.year_to,
            label: `${veh.make} ${veh.model}${yearRange ? ` ${yearRange}` : ''}`,
            slots: {},
            totalVideos: 0,
          };
        }
        if (!groupMap[vid].slots[jobType]) groupMap[vid].slots[jobType] = [];
        // Avoid duplicate videos in same slot
        if (!groupMap[vid].slots[jobType].some(v => v.id === video.id)) {
          groupMap[vid].slots[jobType].push({
            id: video.id,
            youtube_id: video.youtube_id,
            title: video.title,
            channel_name: video.channel_name,
            thumbnail_url: video.thumbnail_url,
            composite_score: video.composite_score,
            is_active: video.is_active,
            flagged: video.flagged,
            job_type: jobType,
          });
          groupMap[vid].totalVideos++;
        }
      });

      const sorted = Object.values(groupMap).sort((a, b) => a.label.localeCompare(b.label));
      setGroups(sorted);

      const allSlots = new Set<string>();
      let totalVids = 0;
      sorted.forEach(g => { Object.keys(g.slots).forEach(s => allSlots.add(s)); totalVids += g.totalVideos; });
      setSummaryStats({ vehicles: sorted.length, slots: allSlots.size, videos: totalVids });
    } catch (err) {
      console.error(err);
      toast.error('Failed to load video library');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleAction = async () => {
    if (!confirmDialog) return;
    const { type, video } = confirmDialog;
    try {
      if (type === 'disable') {
        await supabase.from('youtube_videos').update({ is_active: false }).eq('id', video.id);
        toast.success(`"${video.title}" disabled`);
      } else if (type === 'enable') {
        await supabase.from('youtube_videos').update({ is_active: true, flagged: false }).eq('id', video.id);
        toast.success(`"${video.title}" enabled`);
      } else if (type === 'remove') {
        await supabase.from('youtube_videos').update({ is_active: false, flagged: true, flagged_reason: 'manually_removed' }).eq('id', video.id);
        toast.success(`"${video.title}" removed`);
      } else if (type === 'flag') {
        await supabase.from('youtube_videos').update({ flagged: true, flagged_reason: 'manual_flag' }).eq('id', video.id);
        toast.success(`"${video.title}" flagged for review`);
      }
      setConfirmDialog(null);
      fetchData();
    } catch {
      toast.error('Action failed');
    }
  };

  const filtered = search.trim()
    ? groups.filter(g => g.label.toLowerCase().includes(search.toLowerCase()))
    : groups;

  return (
    <div className="space-y-4 mt-4">
      {/* Summary strip */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span><strong className="text-foreground">{summaryStats.vehicles}</strong> vehicles covered</span>
        <span className="text-border">|</span>
        <span><strong className="text-foreground">{summaryStats.slots}</strong> part slots</span>
        <span className="text-border">|</span>
        <span><strong className="text-foreground">{summaryStats.videos}</strong> total videos</span>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by make or model…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9 h-9 text-sm"
        />
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <Card className="border-border"><CardContent className="p-8 text-center text-muted-foreground">
          {search ? 'No vehicles match your search.' : 'No vehicles with fitting guides found.'}
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(group => {
            const isExpanded = expanded.has(group.vehicle_id);
            return (
              <Card key={group.vehicle_id} className="border-border overflow-hidden">
                {/* Vehicle header */}
                <button
                  onClick={() => toggleExpand(group.vehicle_id)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/30 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronUp size={16} className="text-muted-foreground shrink-0" /> : <ChevronDown size={16} className="text-muted-foreground shrink-0" />}
                    <div>
                      <span className="text-sm font-semibold text-foreground">{group.label}</span>
                      <span className="text-xs text-muted-foreground ml-3">{group.totalVideos} video{group.totalVideos !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {Object.keys(group.slots).map(slot => (
                      <Badge key={slot} variant="outline" className="text-[10px] border-border font-normal hidden sm:inline-flex">{slot}</Badge>
                    ))}
                  </div>
                </button>

                {/* Expanded: Part slot sections */}
                {isExpanded && (
                  <div className="border-t border-border">
                    {Object.entries(group.slots).sort((a, b) => a[0].localeCompare(b[0])).map(([slotName, videos]) => (
                      <div key={slotName} className="border-b border-border last:border-0">
                        <div className="px-4 py-2 bg-secondary/30">
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{slotName}</span>
                          <span className="text-xs text-muted-foreground ml-2">({videos.length})</span>
                        </div>
                        <div className="divide-y divide-border">
                          {videos.map(video => (
                            <div key={video.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/20 transition-colors">
                              {/* Thumbnail */}
                              {video.thumbnail_url ? (
                                <img src={video.thumbnail_url} alt="" className="w-[72px] h-[40px] object-cover rounded shrink-0" />
                              ) : (
                                <div className="w-[72px] h-[40px] bg-muted rounded flex items-center justify-center shrink-0">
                                  <Film size={14} className="text-muted-foreground" />
                                </div>
                              )}
                              {/* Info */}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">{video.title}</p>
                                <p className="text-xs text-muted-foreground">{video.channel_name || '—'}</p>
                              </div>
                              {/* Score */}
                              <ScorePill score={video.composite_score} />
                              {/* Status */}
                              <StatusBadge isActive={video.is_active} flagged={video.flagged} />
                              {/* Actions */}
                              <div className="flex items-center gap-1 shrink-0">
                                <Button size="icon" variant="ghost" className="h-7 w-7" title="Watch"
                                  onClick={() => window.open(`https://youtube.com/watch?v=${video.youtube_id}`, '_blank')}>
                                  <Play size={13} />
                                </Button>
                                {video.is_active ? (
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" title="Disable"
                                    onClick={() => setConfirmDialog({ type: 'disable', video })}>
                                    <EyeOff size={13} />
                                  </Button>
                                ) : (
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-400" title="Enable"
                                    onClick={() => setConfirmDialog({ type: 'enable', video })}>
                                    <Eye size={13} />
                                  </Button>
                                )}
                                {!video.flagged && (
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-amber-400" title="Flag"
                                    onClick={() => setConfirmDialog({ type: 'flag', video })}>
                                    <Flag size={13} />
                                  </Button>
                                )}
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Remove"
                                  onClick={() => setConfirmDialog({ type: 'remove', video })}>
                                  <Trash2 size={13} />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Confirm Dialog */}
      <Dialog open={!!confirmDialog} onOpenChange={() => setConfirmDialog(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {confirmDialog?.type === 'disable' && 'Disable Video'}
              {confirmDialog?.type === 'enable' && 'Enable Video'}
              {confirmDialog?.type === 'remove' && 'Remove Video'}
              {confirmDialog?.type === 'flag' && 'Flag Video'}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {confirmDialog?.type === 'disable' && 'Are you sure you want to disable this video? It will no longer appear anywhere on the site.'}
            {confirmDialog?.type === 'enable' && `Re-enable "${confirmDialog.video.title}"? It will become visible on the site again.`}
            {confirmDialog?.type === 'remove' && 'Remove this video from the library permanently? This cannot be undone easily.'}
            {confirmDialog?.type === 'flag' && `Flag "${confirmDialog.video.title}" for review?`}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(null)}>Cancel</Button>
            <Button
              variant={confirmDialog?.type === 'remove' ? 'destructive' : confirmDialog?.type === 'flag' ? 'outline' : 'default'}
              className={confirmDialog?.type === 'flag' ? 'border-amber-500 text-amber-400 hover:bg-amber-500/10' : ''}
              onClick={handleAction}
            >
              {confirmDialog?.type === 'disable' && 'Disable Video'}
              {confirmDialog?.type === 'enable' && 'Enable Video'}
              {confirmDialog?.type === 'remove' && 'Remove Video'}
              {confirmDialog?.type === 'flag' && 'Flag Video'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   TAB 2 — REPORTS
   ═══════════════════════════════════════════════ */
function ReportsTab() {
  const [reports, setReports] = useState<Report[]>([]);
  const [resolved, setResolved] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<'pending' | 'resolved'>('pending');

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const [pendingRes, resolvedRes] = await Promise.all([
        supabase.from('youtube_video_reports').select('*').is('reviewed_at', null).order('created_at', { ascending: false }),
        supabase.from('youtube_video_reports').select('*').not('reviewed_at', 'is', null).order('reviewed_at', { ascending: false }).limit(50),
      ]);

      // Enrich with video data
      const allReports = [...(pendingRes.data || []), ...(resolvedRes.data || [])];
      const videoIds = [...new Set(allReports.map(r => r.video_id))];

      let videoMap: Record<string, { title: string; thumbnail_url: string; youtube_id: string }> = {};
      if (videoIds.length) {
        const vRes = await supabase.from('youtube_videos').select('id, title, thumbnail_url, youtube_id').in('id', videoIds);
        (vRes.data || []).forEach(v => { videoMap[v.id] = v; });
      }

      const enrich = (list: any[]) => list.map(r => ({
        ...r,
        video_title: videoMap[r.video_id]?.title || 'Unknown',
        video_thumbnail: videoMap[r.video_id]?.thumbnail_url || null,
        video_youtube_id: videoMap[r.video_id]?.youtube_id || null,
      }));

      setReports(enrich(pendingRes.data || []));
      setResolved(enrich(resolvedRes.data || []));
    } catch (err) {
      console.error(err);
      toast.error('Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const handleDismiss = async (report: Report) => {
    try {
      await supabase.from('youtube_video_reports').update({
        reviewed_at: new Date().toISOString(),
        action_taken: 'dismissed',
        reviewed_by: 'emily_dashboard',
      }).eq('id', report.id);
      toast.success('Report dismissed');
      fetchReports();
    } catch {
      toast.error('Failed to dismiss report');
    }
  };

  const handleDeactivate = async (report: Report) => {
    try {
      await Promise.all([
        supabase.from('youtube_video_reports').update({
          reviewed_at: new Date().toISOString(),
          action_taken: 'deactivated',
          reviewed_by: 'emily_dashboard',
        }).eq('id', report.id),
        supabase.from('youtube_videos').update({ is_active: false }).eq('id', report.video_id),
      ]);
      toast.success('Video deactivated');
      fetchReports();
    } catch {
      toast.error('Failed to deactivate video');
    }
  };

  const formatReason = (reason: string | null) => {
    if (!reason) return '—';
    return reason.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  if (loading) return <div className="space-y-3 mt-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>;

  return (
    <div className="space-y-4 mt-4">
      <div className="flex gap-2">
        <Button size="sm" variant={subTab === 'pending' ? 'default' : 'outline'} onClick={() => setSubTab('pending')}>
          Pending ({reports.length})
        </Button>
        <Button size="sm" variant={subTab === 'resolved' ? 'default' : 'outline'} onClick={() => setSubTab('resolved')}>
          Resolved ({resolved.length})
        </Button>
      </div>

      {subTab === 'pending' && (
        reports.length === 0 ? (
          <Card className="border-border"><CardContent className="p-12 text-center">
            <CheckCircle2 size={48} className="mx-auto text-emerald-400 mb-3" />
            <p className="text-foreground font-medium">No reports to review. All clear.</p>
          </CardContent></Card>
        ) : (
          <div className="space-y-3">
            {reports.map(r => (
              <Card key={r.id} className="border-border">
                <CardContent className="p-4">
                  <div className="flex gap-4">
                    {r.video_thumbnail ? (
                      <img src={r.video_thumbnail} alt="" className="w-[100px] h-[56px] object-cover rounded shrink-0" />
                    ) : (
                      <div className="w-[100px] h-[56px] bg-muted rounded flex items-center justify-center shrink-0"><Film size={20} className="text-muted-foreground" /></div>
                    )}
                    <div className="flex-1 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-foreground">{r.video_title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-[10px] border-border">{formatReason(r.report_reason)}</Badge>
                            <Badge variant="outline" className="text-[10px] border-border capitalize">{r.report_source || '—'}</Badge>
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</span>
                      </div>
                      {r.report_notes && <p className="text-xs text-muted-foreground">{r.report_notes}</p>}
                      <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleDismiss(r)}>Dismiss</Button>
                        <Button size="sm" className="h-7 text-xs bg-amber-500 hover:bg-amber-600 text-background" onClick={() => handleDeactivate(r)}>
                          Deactivate Video
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      )}

      {subTab === 'resolved' && (
        resolved.length === 0 ? (
          <Card className="border-border"><CardContent className="p-8 text-center text-muted-foreground">No resolved reports yet.</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {resolved.map(r => (
              <Card key={r.id} className="border-border">
                <CardContent className="p-4">
                  <div className="flex gap-4 items-center">
                    {r.video_thumbnail ? (
                      <img src={r.video_thumbnail} alt="" className="w-[80px] h-[45px] object-cover rounded shrink-0" />
                    ) : (
                      <div className="w-[80px] h-[45px] bg-muted rounded flex items-center justify-center shrink-0"><Film size={16} className="text-muted-foreground" /></div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{r.video_title}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <Badge variant="outline" className={`text-[10px] border-transparent ${r.action_taken === 'deactivated' ? 'bg-destructive/20 text-destructive' : 'bg-muted/40 text-muted-foreground'}`}>
                          {r.action_taken || '—'}
                        </Badge>
                        <span>by {r.reviewed_by || '—'}</span>
                        <span>· {r.reviewed_at ? formatDistanceToNow(new Date(r.reviewed_at), { addSuffix: true }) : '—'}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   TAB 3 — ADD VIDEO
   ═══════════════════════════════════════════════ */
function AddVideoTab() {
  const [url, setUrl] = useState('');
  const [fetching, setFetching] = useState(false);
  const [meta, setMeta] = useState<FetchedMeta | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form fields
  const [jobType, setJobType] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [yearFrom, setYearFrom] = useState('');
  const [yearTo, setYearTo] = useState('');
  const [submittedBy, setSubmittedBy] = useState('');

  // Vehicle dropdowns
  const [makes, setMakes] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);

  useEffect(() => {
    supabase.from('vehicle').select('make').then(r => {
      const unique = [...new Set((r.data || []).map(v => v.make).filter(Boolean))].sort();
      setMakes(unique);
    });
  }, []);

  useEffect(() => {
    if (!make) { setModels([]); return; }
    supabase.from('vehicle').select('model').eq('make', make).then(r => {
      const unique = [...new Set((r.data || []).map(v => v.model).filter(Boolean))].sort();
      setModels(unique);
    });
  }, [make]);

  const extractVideoId = (input: string): string | null => {
    const trimmed = input.trim();
    // youtube.com/watch?v=ID
    const match1 = trimmed.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (match1) return match1[1];
    // youtu.be/ID
    const match2 = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (match2) return match2[1];
    // Raw ID
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
    return null;
  };

  const handleFetch = async () => {
    const videoId = extractVideoId(url);
    if (!videoId) { toast.error('Invalid YouTube URL or video ID'); return; }
    setFetching(true);
    setMeta(null);
    try {
      const { data, error } = await supabase.functions.invoke('youtube-fetch-single', {
        body: { youtube_id: videoId },
      });
      if (error) throw error;
      setMeta(data);
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch video metadata');
    } finally {
      setFetching(false);
    }
  };

  const handleSubmit = async () => {
    if (!meta || !jobType) { toast.error('Please select a job type'); return; }
    if (meta.already_exists) { toast.error('This video already exists in the library'); return; }
    setSubmitting(true);
    try {
      // Insert video
      const { data: videoData, error: videoErr } = await supabase.from('youtube_videos').insert({
        youtube_id: meta.youtube_id,
        title: meta.title,
        description: meta.description,
        channel_id: meta.channel_id,
        channel_name: meta.channel_name,
        channel_subscriber_count: meta.channel_subscriber_count,
        duration_seconds: meta.duration_seconds,
        published_at: meta.published_at,
        thumbnail_url: meta.thumbnail_url,
        view_count: meta.view_count,
        like_count: meta.like_count,
        comment_count: meta.comment_count,
        is_active: true,
        flagged: false,
      }).select('id').single();
      if (videoErr) throw videoErr;

      const videoId = videoData.id;

      // Insert job mapping
      await supabase.from('youtube_job_mappings').insert({
        video_id: videoId,
        job_type: jobType,
        make: make || null,
        model: model || null,
        year_from: yearFrom ? parseInt(yearFrom) : null,
        year_to: yearTo ? parseInt(yearTo) : null,
        search_query: 'manual_submission',
      });

      // Insert report record
      await supabase.from('youtube_video_reports').insert({
        video_id: videoId,
        report_source: submittedBy ? 'partner' : 'manual_url',
        reported_by_email: submittedBy || null,
        action_taken: 'dismissed',
        reviewed_at: new Date().toISOString(),
        reviewed_by: 'emily_dashboard',
      });

      toast.success('Video added to library successfully. Stats and scoring will update overnight.');

      // Reset
      setUrl('');
      setMeta(null);
      setJobType('');
      setMake('');
      setModel('');
      setYearFrom('');
      setYearTo('');
      setSubmittedBy('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to add video');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6 mt-4">
      {/* Step 1 — URL */}
      <Card className="border-border">
        <CardContent className="p-5 space-y-3">
          <Label className="text-foreground font-medium">Step 1 — Paste YouTube URL or Video ID</Label>
          <div className="flex gap-2">
            <Input placeholder="https://www.youtube.com/watch?v=... or video ID" value={url} onChange={e => setUrl(e.target.value)} className="flex-1" />
            <Button onClick={handleFetch} disabled={!url.trim() || fetching}>
              {fetching ? <><Loader2 size={14} className="mr-2 animate-spin" /> Fetching…</> : 'Fetch Video'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Step 2 — Preview */}
      {meta && (
        <Card className="border-border">
          <CardContent className="p-5 space-y-4">
            <Label className="text-foreground font-medium">Step 2 — Preview</Label>
            {meta.already_exists && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/30">
                <AlertTriangle size={16} className="text-amber-400 shrink-0" />
                <p className="text-sm text-amber-400">This video is already in the library.</p>
              </div>
            )}
            <div className="flex gap-4">
              <img src={meta.thumbnail_url} alt="" className="w-[240px] h-[135px] object-cover rounded shrink-0" />
              <div className="space-y-1 text-sm">
                <p className="font-medium text-foreground">{meta.title}</p>
                <p className="text-muted-foreground">{meta.channel_name} · {meta.channel_subscriber_count?.toLocaleString()} subscribers</p>
                <p className="text-muted-foreground">{formatDuration(meta.duration_seconds)} · {meta.view_count?.toLocaleString()} views · {meta.like_count?.toLocaleString()} likes</p>
                <p className="text-muted-foreground">Published {meta.published_at ? format(new Date(meta.published_at), 'd MMM yyyy') : '—'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3 — Assign */}
      {meta && !meta.already_exists && (
        <Card className="border-border">
          <CardContent className="p-5 space-y-4">
            <Label className="text-foreground font-medium">Step 3 — Assign to Job & Vehicle</Label>

            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Job Type *</Label>
                <Select value={jobType} onValueChange={setJobType}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select job type" /></SelectTrigger>
                  <SelectContent>
                    {JOB_TYPES.map(jt => <SelectItem key={jt} value={jt}>{jt}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Make (optional)</Label>
                  <Select value={make} onValueChange={v => { setMake(v); setModel(''); }}>
                    <SelectTrigger><SelectValue placeholder="Any make" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Any</SelectItem>
                      {makes.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Model (optional)</Label>
                  <Select value={model} onValueChange={setModel} disabled={!make}>
                    <SelectTrigger><SelectValue placeholder="Any model" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Any</SelectItem>
                      {models.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Year From</Label>
                  <Input type="number" placeholder="e.g. 2010" value={yearFrom} onChange={e => setYearFrom(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Year To</Label>
                  <Input type="number" placeholder="e.g. 2024" value={yearTo} onChange={e => setYearTo(e.target.value)} />
                </div>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Submitted By (name or email)</Label>
                <Input placeholder="e.g. partner@example.com" value={submittedBy} onChange={e => setSubmittedBy(e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4 — Submit */}
      {meta && !meta.already_exists && (
        <Button onClick={handleSubmit} disabled={submitting || !jobType} className="w-full">
          {submitting ? <><Loader2 size={14} className="mr-2 animate-spin" /> Adding…</> : <><Plus size={14} className="mr-2" /> Add to Library</>}
        </Button>
      )}
    </div>
  );
}
