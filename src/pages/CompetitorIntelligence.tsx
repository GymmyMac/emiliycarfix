import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import TargetAnalysisPanel from '@/components/TargetAnalysisPanel';
import * as XLSX from 'xlsx';
import { differenceInDays, format } from 'date-fns';

interface CompetitorConfig {
  key: string;
  label: string;
  domain: string;
  configKey: string;
}

const COMPETITORS: CompetitorConfig[] = [
  { key: 'repco', label: 'Repco', domain: 'repco.co.nz', configKey: 'competitor_last_upload_repco' },
  { key: 'supercheapauto', label: 'Super Cheap Auto', domain: 'supercheapauto.co.nz', configKey: 'competitor_last_upload_supercheapauto' },
  { key: 'tinkr', label: 'Tinkr', domain: 'tinkr.co.nz', configKey: 'competitor_last_upload_tinkr' },
];

const COLUMN_MAP = [
  'keyword', 'clicks', 'traffic_pct', 'change', 'desktop_share', 'mobile_share',
  'kd', 'intent', 'volume', 'avg_volume', 'cpc', 'zero_click',
  'position', 'pos_change', 'top_url',
];

interface SummaryRow {
  competitor: string;
  month_year: string;
  keywords: number;
  total_clicks: number;
  low_kd_count: number;
}

function getStatusBadge(lastUpload: string | null) {
  if (!lastUpload) {
    return <Badge variant="destructive">Overdue</Badge>;
  }
  const days = differenceInDays(new Date(), new Date(lastUpload));
  if (days < 35) return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/20">Up to date</Badge>;
  if (days <= 50) return <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 hover:bg-amber-500/20">Due for refresh</Badge>;
  return <Badge variant="destructive">Overdue</Badge>;
}

function detectMonthYear(filename: string): string | null {
  const match = filename.match(/-\((\d{4})_(\d{2})\)\.xlsx$/i);
  if (match) return `${match[1]}-${match[2]}`;
  return null;
}

export default function CompetitorIntelligence() {
  const [lastUploads, setLastUploads] = useState<Record<string, string | null>>({});
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [progress, setProgress] = useState<Record<string, { pct: number; msg: string }>>({});
  const [droppedFiles, setDroppedFiles] = useState<Record<string, File | null>>({});
  const [manualMonth, setManualMonth] = useState<Record<string, string>>({});
  const [needsManualMonth, setNeedsManualMonth] = useState<Record<string, boolean>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    const configKeys = COMPETITORS.map(c => c.configKey);
    const { data: configData } = await supabase
      .from('app_config')
      .select('key, value')
      .in('key', configKeys);

    const uploads: Record<string, string | null> = {};
    COMPETITORS.forEach(c => { uploads[c.key] = null; });
    configData?.forEach((row: { key: string; value: string }) => {
      const comp = COMPETITORS.find(c => c.configKey === row.key);
      if (comp) uploads[comp.key] = row.value;
    });
    setLastUploads(uploads);

    const { data: summaryData } = await supabase.rpc('get_competitor_summary');
    if (summaryData) {
      setSummary(summaryData);
    } else {
      // Fallback: query directly
      const { data: fallback } = await supabase
        .from('competitor_keywords')
        .select('competitor, month_year, clicks, kd');
      if (fallback) {
        const grouped: Record<string, SummaryRow> = {};
        fallback.forEach((r: any) => {
          const k = `${r.competitor}__${r.month_year}`;
          if (!grouped[k]) grouped[k] = { competitor: r.competitor, month_year: r.month_year, keywords: 0, total_clicks: 0, low_kd_count: 0 };
          grouped[k].keywords++;
          grouped[k].total_clicks += r.clicks || 0;
          if (r.kd != null && r.kd <= 20) grouped[k].low_kd_count++;
        });
        setSummary(Object.values(grouped).sort((a, b) => a.competitor.localeCompare(b.competitor) || b.month_year.localeCompare(a.month_year)));
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleFile = (competitorKey: string, file: File | null) => {
    if (!file) return;
    if (!file.name.endsWith('.xlsx')) {
      toast.error('Only .xlsx files are accepted');
      return;
    }
    setDroppedFiles(prev => ({ ...prev, [competitorKey]: file }));
    const detected = detectMonthYear(file.name);
    if (detected) {
      setNeedsManualMonth(prev => ({ ...prev, [competitorKey]: false }));
      setManualMonth(prev => ({ ...prev, [competitorKey]: detected }));
    } else {
      setNeedsManualMonth(prev => ({ ...prev, [competitorKey]: true }));
    }
  };

  const handleUpload = async (competitor: CompetitorConfig) => {
    const file = droppedFiles[competitor.key];
    if (!file) { toast.error('Drop a file first'); return; }

    const monthYear = manualMonth[competitor.key] || detectMonthYear(file.name);
    if (!monthYear || !/^\d{4}-\d{2}$/.test(monthYear)) {
      toast.error('Please enter a valid month (YYYY-MM)');
      return;
    }

    setUploading(prev => ({ ...prev, [competitor.key]: true }));
    setProgress(prev => ({ ...prev, [competitor.key]: { pct: 10, msg: 'Reading file...' } }));

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets['Website_Keywords'];
      if (!sheet) throw new Error('Sheet "Website_Keywords" not found in file');

      const raw: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      // Skip header row
      const dataRows = raw.slice(1).filter(row => row[0] && String(row[0]).trim() !== '');

      setProgress(prev => ({ ...prev, [competitor.key]: { pct: 30, msg: `Parsing ${dataRows.length.toLocaleString()} rows...` } }));

      const records = dataRows.map(row => {
        const obj: Record<string, any> = {
          competitor: competitor.key,
          month_year: monthYear,
          category: null,
        };
        COLUMN_MAP.forEach((col, i) => {
          if (col === 'change' || col === 'desktop_share' || col === 'mobile_share') return; // skip non-stored cols
          let val = row[i] ?? null;
          if (['clicks', 'kd', 'volume', 'avg_volume', 'position'].includes(col)) val = val != null ? Number(val) || 0 : null;
          if (['traffic_pct', 'cpc', 'zero_click'].includes(col)) val = val != null ? parseFloat(String(val)) || 0 : null;
          if (col === 'pos_change' || col === 'top_url' || col === 'intent' || col === 'keyword') val = val != null ? String(val) : null;
          obj[col] = val;
        });
        return obj;
      });

      // Batch upload
      const BATCH = 300;
      const total = records.length;
      for (let i = 0; i < total; i += BATCH) {
        const batch = records.slice(i, i + BATCH);
        const pct = 30 + Math.round(((i + batch.length) / total) * 60);
        setProgress(prev => ({ ...prev, [competitor.key]: { pct, msg: `Uploading ${Math.min(i + BATCH, total).toLocaleString()} / ${total.toLocaleString()}...` } }));

        const { error } = await supabase.functions.invoke('bulk-import-keywords', { body: batch });
        if (error) throw new Error(error.message || 'Upload failed');
      }

      // Update app_config
      const today = format(new Date(), 'yyyy-MM-dd');
      await supabase.from('app_config').upsert([
        { key: competitor.configKey, value: today },
        { key: 'competitor_upload_month', value: monthYear },
      ], { onConflict: 'key' });

      setProgress(prev => ({ ...prev, [competitor.key]: { pct: 100, msg: 'Done!' } }));
      toast.success(`${competitor.label} — ${total.toLocaleString()} keywords loaded ✅`);
      setDroppedFiles(prev => ({ ...prev, [competitor.key]: null }));
      setNeedsManualMonth(prev => ({ ...prev, [competitor.key]: false }));
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(prev => ({ ...prev, [competitor.key]: false }));
      setTimeout(() => setProgress(prev => ({ ...prev, [competitor.key]: { pct: 0, msg: '' } })), 2000);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Competitor Intelligence</h1>
        <p className="text-sm text-muted-foreground mt-1">Upload monthly keyword exports to keep Emily's competitive targeting sharp.</p>
      </div>

      {/* Upload Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {COMPETITORS.map(comp => {
          const lastDate = lastUploads[comp.key];
          const isUploading = uploading[comp.key];
          const prog = progress[comp.key];
          const dropped = droppedFiles[comp.key];

          return (
            <Card key={comp.key} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{comp.label}</CardTitle>
                  {getStatusBadge(lastDate)}
                </div>
                <p className="text-xs text-muted-foreground">{comp.domain}</p>
                <p className="text-xs text-muted-foreground">
                  Last upload: {lastDate ? format(new Date(lastDate), 'dd MMM yyyy') : 'Never'}
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Drop zone */}
                <div
                  onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={e => { e.preventDefault(); e.stopPropagation(); handleFile(comp.key, e.dataTransfer.files[0]); }}
                  onClick={() => fileInputRefs.current[comp.key]?.click()}
                  className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                >
                  <input
                    ref={el => { fileInputRefs.current[comp.key] = el; }}
                    type="file"
                    accept=".xlsx"
                    className="hidden"
                    onChange={e => handleFile(comp.key, e.target.files?.[0] || null)}
                  />
                  {dropped ? (
                    <div className="flex items-center gap-2 justify-center text-sm text-foreground">
                      <FileSpreadsheet size={16} className="text-primary" />
                      <span className="truncate max-w-[180px]">{dropped.name}</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-muted-foreground">
                      <Upload size={20} />
                      <span className="text-xs">Drop .xlsx or click to browse</span>
                    </div>
                  )}
                </div>

                {needsManualMonth[comp.key] && (
                  <Input
                    placeholder="YYYY-MM (e.g. 2025-11)"
                    value={manualMonth[comp.key] || ''}
                    onChange={e => setManualMonth(prev => ({ ...prev, [comp.key]: e.target.value }))}
                    className="text-sm"
                  />
                )}

                {prog && prog.pct > 0 && (
                  <div className="space-y-1">
                    <Progress value={prog.pct} className="h-2" />
                    <p className="text-xs text-muted-foreground">{prog.msg}</p>
                  </div>
                )}

                <Button
                  onClick={() => handleUpload(comp)}
                  disabled={!dropped || isUploading}
                  className="w-full"
                  size="sm"
                >
                  {isUploading ? 'Processing...' : 'Upload & Process'}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Summary Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Current Data Summary</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : summary.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No competitor data loaded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Competitor</TableHead>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Keywords</TableHead>
                  <TableHead className="text-right">Total Clicks</TableHead>
                  <TableHead className="text-right">Low-KD Opportunities</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium capitalize">{row.competitor}</TableCell>
                    <TableCell>{row.month_year}</TableCell>
                    <TableCell className="text-right">{row.keywords.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{row.total_clicks.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{row.low_kd_count.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
