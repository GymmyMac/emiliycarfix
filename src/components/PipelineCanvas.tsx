import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  Timer, Power, Brain, Zap, Video, FileText, ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/* ─── Node definitions ─── */
interface PipelineNode {
  id: string;
  label: string;
  subtitle: string;
  icon: React.ElementType;
  flagKey?: string;
  type: 'trigger' | 'control' | 'logic' | 'execution' | 'final';
  col: number;
  row: number;
}

const NODES: PipelineNode[] = [
  { id: 'trigger', label: 'Daily Cron', subtitle: 'Founder Request', icon: Timer, type: 'trigger', col: 0, row: 1 },
  { id: 'master', label: 'Master Autopilot', subtitle: 'emily_global_active', icon: Power, type: 'control', col: 1, row: 1, flagKey: 'emily_global_active' },
  { id: 'router', label: 'Initiative Router', subtitle: 'Splits into streams', icon: Brain, type: 'logic', col: 2, row: 1 },
  { id: 'aeo', label: 'AEO Engine', subtitle: 'SKU Enrichment', icon: Zap, type: 'execution', col: 3, row: 0, flagKey: 'initiative_sku_aeo_enrichment' },
  { id: 'social', label: 'Social Advisory', subtitle: 'TikTok Strategy', icon: Video, type: 'execution', col: 3, row: 1, flagKey: 'emily_gen_tiktok_script' },
  { id: 'seo', label: 'SEO Guides', subtitle: 'Decision Pages', icon: FileText, type: 'execution', col: 3, row: 2, flagKey: 'initiative_seo_decision_pages' },
  { id: 'quality', label: 'Quality Gating', subtitle: 'OpenRouter Policy', icon: ShieldCheck, type: 'final', col: 4, row: 1 },
];

const EDGES: [string, string][] = [
  ['trigger', 'master'],
  ['master', 'router'],
  ['router', 'aeo'],
  ['router', 'social'],
  ['router', 'seo'],
  ['aeo', 'quality'],
  ['social', 'quality'],
  ['seo', 'quality'],
];

/* ─── Helpers ─── */
const NODE_W = 200;
const NODE_H = 88;
const COL_GAP = 60;
const ROW_GAP = 28;

function getNodePos(node: PipelineNode) {
  const x = node.col * (NODE_W + COL_GAP) + 40;
  const y = node.row * (NODE_H + ROW_GAP) + 30;
  return { x, y };
}

function getCanvasSize() {
  const maxCol = Math.max(...NODES.map(n => n.col));
  const maxRow = Math.max(...NODES.map(n => n.row));
  return {
    width: (maxCol + 1) * (NODE_W + COL_GAP) + 80,
    height: (maxRow + 1) * (NODE_H + ROW_GAP) + 60,
  };
}

/* ─── Curved SVG path ─── */
function CurvedEdge({ from, to, active }: { from: { x: number; y: number }; to: { x: number; y: number }; active: boolean }) {
  const startX = from.x + NODE_W;
  const startY = from.y + NODE_H / 2;
  const endX = to.x;
  const endY = to.y + NODE_H / 2;
  const cpX = (startX + endX) / 2;

  const d = `M ${startX} ${startY} C ${cpX} ${startY}, ${cpX} ${endY}, ${endX} ${endY}`;

  return (
    <motion.path
      d={d}
      fill="none"
      strokeWidth={2}
      strokeLinecap="round"
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: 1 }}
      transition={{ duration: 0.8, ease: 'easeInOut' }}
      className={cn(
        'transition-colors duration-300',
        active ? 'stroke-emily' : 'stroke-muted-foreground/30'
      )}
    />
  );
}

/* ─── Node type styles ─── */
const typeStyles: Record<string, string> = {
  trigger: 'border-orange/50 bg-orange/5',
  control: 'border-emily/50 bg-emily/5',
  logic: 'border-primary/50 bg-primary/5',
  execution: '', // dynamic
  final: 'border-success/50 bg-success/5',
};

/* ─── Component ─── */
export default function PipelineCanvas() {
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const fetchFlags = useCallback(async () => {
    const { data } = await supabase.from('feature_flags').select('flag_key, flag_value');
    if (data) {
      const map: Record<string, boolean> = {};
      data.forEach((f: any) => { map[f.flag_key] = f.flag_value; });
      setFlags(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchFlags();
    const interval = setInterval(fetchFlags, 60_000);
    return () => clearInterval(interval);
  }, [fetchFlags]);

  const toggleFlag = async (key: string, newValue: boolean) => {
    setFlags(prev => ({ ...prev, [key]: newValue }));
    const { error } = await supabase
      .from('feature_flags')
      .update({ enabled: newValue })
      .eq('flag_key', key);
    if (error) {
      setFlags(prev => ({ ...prev, [key]: !newValue }));
      toast.error('Failed to update');
    } else {
      toast.success('Saved');
    }
  };

  const isNodeActive = (node: PipelineNode): boolean => {
    if (!node.flagKey) return true;
    return flags[node.flagKey] ?? false;
  };

  const isEdgeActive = (fromId: string, toId: string): boolean => {
    const fromNode = NODES.find(n => n.id === fromId);
    const toNode = NODES.find(n => n.id === toId);
    if (!fromNode || !toNode) return false;
    return isNodeActive(fromNode) && isNodeActive(toNode);
  };

  const canvas = getCanvasSize();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-pulse text-muted-foreground text-sm">Loading pipeline…</div>
      </div>
    );
  }

  return (
    <div className="relative w-full overflow-x-auto rounded-xl border border-border bg-[hsl(222_47%_8%)] p-4">
      {/* Grid background */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: 'radial-gradient(circle, hsl(var(--muted-foreground)) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />

      <div className="relative" style={{ width: canvas.width, height: canvas.height, minWidth: canvas.width }}>
        {/* SVG edges */}
        <svg className="absolute inset-0 pointer-events-none" width={canvas.width} height={canvas.height}>
          {EDGES.map(([fromId, toId]) => {
            const from = NODES.find(n => n.id === fromId)!;
            const to = NODES.find(n => n.id === toId)!;
            return (
              <CurvedEdge
                key={`${fromId}-${toId}`}
                from={getNodePos(from)}
                to={getNodePos(to)}
                active={isEdgeActive(fromId, toId)}
              />
            );
          })}
        </svg>

        {/* Nodes */}
        <AnimatePresence>
          {NODES.map((node) => {
            const pos = getNodePos(node);
            const active = isNodeActive(node);
            const Icon = node.icon;

            const nodeClass = node.type === 'execution'
              ? active
                ? 'border-emily/60 bg-emily/10 shadow-[0_0_20px_hsl(199_89%_60%/0.15)]'
                : 'border-destructive/40 bg-destructive/5 saturate-50'
              : typeStyles[node.type];

            return (
              <motion.div
                key={node.id}
                className={cn(
                  'absolute rounded-xl border backdrop-blur-md px-4 py-3 flex flex-col gap-1.5 transition-all duration-300',
                  nodeClass
                )}
                style={{ left: pos.x, top: pos.y, width: NODE_W, height: NODE_H }}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: node.col * 0.1 }}
              >
                <div className="flex items-center gap-2">
                  <Icon size={16} className={cn(
                    active ? 'text-emily' : 'text-muted-foreground/50'
                  )} />
                  <span className="text-xs font-semibold text-white/90 truncate">{node.label}</span>
                  {node.flagKey && (
                    <Badge
                      variant={active ? 'default' : 'secondary'}
                      className="ml-auto text-[9px] px-1.5 py-0"
                    >
                      {active ? 'ON' : 'OFF'}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-white/40 truncate">{node.subtitle}</span>
                  {node.flagKey && (
                    <Switch
                      checked={active}
                      onCheckedChange={(v) => toggleFlag(node.flagKey!, v)}
                      className="scale-75 origin-right"
                    />
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
