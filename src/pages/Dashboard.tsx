import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

/* ─── 12 knowledge cluster definitions ─── */
const NODE_DEFS = [
  { id: 'emily',    label: 'Emily',    sublabel: 'AI Director',     color: '#f59e0b' },
  { id: 'ag',       label: 'AG',       sublabel: 'Automation Ops',  color: '#14b8a6' },
  { id: 'campaign', label: 'Campaign', sublabel: 'Social·Email·SMS', color: '#f43f5e' },
  { id: 'content',  label: 'SEO/AEO', sublabel: 'Content Pipeline', color: '#3b82f6' },
  { id: 'enrich',   label: 'Enrich',  sublabel: 'AEO Pipeline',     color: '#84cc16' },
  { id: 'parts',    label: 'Parts',   sublabel: 'Catalogue',        color: '#10b981' },
  { id: 'vehicles', label: 'Vehicles', sublabel: 'Fleet & Fitment', color: '#06b6d4' },
  { id: 'brain',    label: 'Brain',   sublabel: 'Patterns & DTC',   color: '#8b5cf6' },
  { id: 'youtube',  label: 'YouTube', sublabel: 'Videos & Maps',    color: '#ef4444' },
  { id: 'vector',   label: 'Vector',  sublabel: 'Knowledge Index',  color: '#ec4899' },
  { id: 'intel',    label: 'Intel',   sublabel: 'Competitor Data',  color: '#f97316' },
  { id: 'memory',   label: 'Memory',  sublabel: 'Emily Learning',   color: '#a78bfa' },
];

const EDGES: [string, string][] = [
  ['ag',       'emily'],
  ['ag',       'campaign'],
  ['emily',    'campaign'],
  ['emily',    'content'],
  ['emily',    'brain'],
  ['emily',    'vector'],
  ['campaign', 'vector'],
  ['content',  'vector'],
  ['content',  'intel'],
  ['parts',    'enrich'],
  ['enrich',   'content'],
  ['brain',    'content'],
  ['brain',    'vector'],
  ['youtube',  'vehicles'],
  ['vehicles', 'parts'],
  ['intel',    'brain'],
  ['memory',   'emily'],
  ['memory',   'brain'],
];

const FALLBACK: Record<string, number> = {
  emily:    437,
  ag:       18034,
  campaign: 5691,
  content:  634,
  enrich:   7234,
  parts:    58992,
  vehicles: 42253,
  brain:    24442,
  youtube:  246301,
  vector:   27966,
  intel:    5521,
  memory:   74,
};

interface PhysicsNode {
  id: string; label: string; sublabel: string; color: string;
  count: number; radius: number;
  x: number; y: number; vx: number; vy: number; pulse: number;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return Math.round(n / 1_000) + 'k';
  return n.toString();
}

function buildNodes(counts: Record<string, number>, W: number, H: number): PhysicsNode[] {
  const cx = W / 2, cy = H / 2;
  const maxCount = Math.max(...Object.values(counts).filter(Boolean), 1);
  return NODE_DEFS.map((def, i) => {
    const angle  = (i / NODE_DEFS.length) * Math.PI * 2 - Math.PI / 2;
    const spread = Math.min(W, H) * 0.28;
    const count  = counts[def.id] || 500;
    const logRatio = Math.log10(count + 1) / Math.log10(maxCount + 1);
    const radius = 16 + 42 * logRatio;
    return {
      ...def, count, radius,
      x:     cx + Math.cos(angle) * spread + (Math.random() - 0.5) * 80,
      y:     cy + Math.sin(angle) * spread + (Math.random() - 0.5) * 80,
      vx:    (Math.random() - 0.5) * 1.2,
      vy:    (Math.random() - 0.5) * 1.2,
      pulse: (i / NODE_DEFS.length) * Math.PI * 2,
    };
  });
}

export default function Dashboard() {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const nodesRef    = useRef<PhysicsNode[]>([]);
  const animRef     = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const hovIdRef    = useRef<string | null>(null);
  const [hovNode, setHovNode]     = useState<PhysicsNode | null>(null);
  const [totalRecords, setTotalRecords] = useState(0);
  const [lastRefresh, setLastRefresh]   = useState<Date>(new Date());

  /* ── Resize canvas ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const sync = () => {
      const p = canvas.parentElement;
      if (!p) return;
      if (canvas.width !== p.clientWidth || canvas.height !== p.clientHeight) {
        canvas.width = p.clientWidth;
        canvas.height = p.clientHeight;
      }
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(canvas.parentElement!);
    return () => ro.disconnect();
  }, []);

  /* ── Init with fallback ── */
  useEffect(() => {
    const W = canvasRef.current?.width  || 1000;
    const H = canvasRef.current?.height || 700;
    nodesRef.current = buildNodes(FALLBACK, W, H);
    setTotalRecords(Object.values(FALLBACK).reduce((a, b) => a + b, 0));
  }, []);

  /* ── Live Supabase fetch ── */
  const fetchCounts = async () => {
    try {
      const [
        emilyRuns, agRuns, campaignQ, seoQ, aeoQ,
        enrichQ, vmapQ, partsQ,
        brainObs, brainDtc, brainPhys,
        ytVids, ytMaps,
        vehGen, userVeh,
        vectorDocs, compKw,
        memQ, pendQ,
      ] = await Promise.all([
        supabase.from('emily_runs')                .select('*', { count: 'exact', head: true }),
        supabase.from('mkt_scheduler_log')          .select('*', { count: 'exact', head: true }),
        supabase.from('mkt_content_queue')          .select('*', { count: 'exact', head: true }),
        supabase.from('mkt_seo_queue')              .select('*', { count: 'exact', head: true }),
        supabase.from('partslot_aeo_queue')         .select('*', { count: 'exact', head: true }),
        supabase.from('part_enrichment_staging')    .select('*', { count: 'exact', head: true }),
        supabase.from('sas_vehicle_map')            .select('*', { count: 'exact', head: true }),
        supabase.from('sas_catalogue')              .select('*', { count: 'exact', head: true }),
        supabase.from('brain_observation_patterns') .select('*', { count: 'exact', head: true }),
        supabase.from('brain_dtc_codes')            .select('*', { count: 'exact', head: true }),
        supabase.from('brain_physics_patterns')     .select('*', { count: 'exact', head: true }),
        supabase.from('youtube_videos')             .select('*', { count: 'exact', head: true }),
        supabase.from('youtube_video_vehicles')     .select('*', { count: 'exact', head: true }),
        supabase.from('vehicle_generations')        .select('*', { count: 'exact', head: true }),
        supabase.from('user_vehicles')              .select('*', { count: 'exact', head: true }),
        supabase.from('mkt_vectordb_documents')     .select('*', { count: 'exact', head: true }),
        supabase.from('competitor_keywords')        .select('*', { count: 'exact', head: true }),
        supabase.from('emily_memory')               .select('*', { count: 'exact', head: true }),
        supabase.from('emily_pending_actions')      .select('*', { count: 'exact', head: true }),
      ]);

      const c: Record<string, number> = {
        emily:    emilyRuns.count  || FALLBACK.emily,
        ag:       agRuns.count     || FALLBACK.ag,
        campaign: campaignQ.count  || FALLBACK.campaign,
        content:  (seoQ.count || 0) + (aeoQ.count || 0),
        enrich:   (enrichQ.count || 0) + (vmapQ.count || 0),
        parts:    partsQ.count     || FALLBACK.parts,
        vehicles: (vehGen.count || 0) + (userVeh.count || 0),
        brain:    (brainObs.count || 0) + (brainDtc.count || 0) + (brainPhys.count || 0),
        youtube:  (ytVids.count || 0) + (ytMaps.count || 0),
        vector:   vectorDocs.count || FALLBACK.vector,
        intel:    compKw.count     || FALLBACK.intel,
        memory:   (memQ.count || 0) + (pendQ.count || 0),
      };

      const W = canvasRef.current?.width  || 1000;
      const H = canvasRef.current?.height || 700;
      nodesRef.current = buildNodes(c, W, H);
      setTotalRecords(Object.values(c).reduce((a, b) => a + b, 0));
      setLastRefresh(new Date());
    } catch (err) {
      console.warn('Graph fetch error:', err);
    }
  };

  useEffect(() => { fetchCounts(); }, []);

  /* ── Physics + draw loop ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const REPULSION   = 16000;
    const SPRING_K    = 0.014;
    const DAMPING     = 0.84;
    const CENTER_PULL = 0.004;

    function tick(time: number) {
      const dt = Math.min((time - lastTimeRef.current) / 16.67, 3);
      lastTimeRef.current = time;

      const nodes = nodesRef.current;
      const W = canvas.width, H = canvas.height;
      const cx = W / 2, cy = H / 2;
      const REST = Math.min(W, H) * 0.24;

      /* Physics */
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        let fx = 0, fy = 0;

        for (let j = 0; j < nodes.length; j++) {
          if (i === j) continue;
          const b = nodes[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx * dx + dy * dy + 0.1;
          const d  = Math.sqrt(d2);
          const f  = REPULSION / d2;
          fx += (dx / d) * f;
          fy += (dy / d) * f;
        }

        EDGES.forEach(([s, t]) => {
          const otherId = s === a.id ? t : t === a.id ? s : null;
          if (!otherId) return;
          const other = nodes.find(n => n.id === otherId);
          if (!other) return;
          const dx = other.x - a.x, dy = other.y - a.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const f = SPRING_K * (d - REST);
          fx += (dx / d) * f;
          fy += (dy / d) * f;
        });

        fx -= CENTER_PULL * (a.x - cx);
        fy -= CENTER_PULL * (a.y - cy);

        a.vx = (a.vx + fx * dt) * DAMPING;
        a.vy = (a.vy + fy * dt) * DAMPING;
        a.pulse += 0.02;
        a.x += a.vx * dt;
        a.y += a.vy * dt;

        const m = a.radius + 16;
        if (a.x < m)     { a.x = m;     a.vx =  Math.abs(a.vx) * 0.4; }
        if (a.x > W - m) { a.x = W - m; a.vx = -Math.abs(a.vx) * 0.4; }
        if (a.y < m)     { a.y = m;     a.vy =  Math.abs(a.vy) * 0.4; }
        if (a.y > H - m) { a.y = H - m; a.vy = -Math.abs(a.vy) * 0.4; }
      }

      /* Draw */
      ctx.fillStyle = 'rgba(3, 3, 12, 0.78)';
      ctx.fillRect(0, 0, W, H);

      /* Edges */
      EDGES.forEach(([srcId, tgtId]) => {
        const src = nodes.find(n => n.id === srcId);
        const tgt = nodes.find(n => n.id === tgtId);
        if (!src || !tgt) return;

        const grad = ctx.createLinearGradient(src.x, src.y, tgt.x, tgt.y);
        grad.addColorStop(0,   src.color + '50');
        grad.addColorStop(0.5, '#ffffff15');
        grad.addColorStop(1,   tgt.color + '50');

        ctx.beginPath();
        ctx.moveTo(src.x, src.y);
        ctx.lineTo(tgt.x, tgt.y);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.4;
        ctx.stroke();

        const phase = (srcId.charCodeAt(0) * 0.07 + tgtId.charCodeAt(0) * 0.04);
        const t  = ((time / 2400) + phase) % 1;
        const px = src.x + (tgt.x - src.x) * t;
        const py = src.y + (tgt.y - src.y) * t;
        ctx.beginPath();
        ctx.arc(px, py, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = src.color + 'dd';
        ctx.fill();
      });

      /* Nodes */
      nodes.forEach(node => {
        const isHov = node.id === hovIdRef.current;
        const pulse = Math.sin(node.pulse) * 0.09 + 1;
        const r     = node.radius * (isHov ? 1.18 : pulse);
        const glowR = r * (isHov ? 3.0 : 2.2);

        /* Halo */
        const halo = ctx.createRadialGradient(node.x, node.y, r * 0.2, node.x, node.y, glowR);
        halo.addColorStop(0, node.color + (isHov ? '50' : '28'));
        halo.addColorStop(1, 'transparent');
        ctx.beginPath();
        ctx.arc(node.x, node.y, glowR, 0, Math.PI * 2);
        ctx.fillStyle = halo;
        ctx.fill();

        /* Core */
        ctx.save();
        ctx.shadowBlur  = isHov ? 34 : 16;
        ctx.shadowColor = node.color;
        const sphere = ctx.createRadialGradient(
          node.x - r * 0.28, node.y - r * 0.28, 0, node.x, node.y, r
        );
        sphere.addColorStop(0,    node.color + 'ff');
        sphere.addColorStop(0.55, node.color + 'cc');
        sphere.addColorStop(1,    node.color + '44');
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle = sphere;
        ctx.fill();
        ctx.restore();

        /* Ring */
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = node.color + 'aa';
        ctx.lineWidth   = isHov ? 2 : 1.4;
        ctx.stroke();

        /* Label */
        const fs = Math.max(9, r * 0.36);
        ctx.save();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowBlur = 7; ctx.shadowColor = 'rgba(0,0,0,0.95)';
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${fs}px -apple-system, sans-serif`;
        ctx.fillText(node.label, node.x, node.y - fs * 0.4);
        ctx.restore();

        /* Count */
        ctx.save();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(255,255,255,0.62)';
        ctx.font = `${Math.max(7, r * 0.25)}px -apple-system, sans-serif`;
        ctx.fillText(formatCount(node.count), node.x, node.y + fs * 0.7);
        ctx.restore();
      });

      animRef.current = requestAnimationFrame(tick);
    }

    animRef.current = requestAnimationFrame(tick);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, []);

  /* ── Mouse ── */
  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left)  * (canvas.width  / rect.width);
    const my = (e.clientY - rect.top)   * (canvas.height / rect.height);
    const hit = nodesRef.current.find(n => {
      const dx = n.x - mx, dy = n.y - my;
      return Math.sqrt(dx * dx + dy * dy) <= n.radius + 14;
    }) ?? null;
    hovIdRef.current = hit?.id ?? null;
    setHovNode(hit ? { ...hit } : null);
  }
  function handleMouseLeave() { hovIdRef.current = null; setHovNode(null); }

  function handleRefresh() {
    const W = canvasRef.current?.width  || 1000;
    const H = canvasRef.current?.height || 700;
    nodesRef.current = buildNodes(FALLBACK, W, H);
    fetchCounts();
  }

  const refreshStr  = lastRefresh.toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' });
  const totalStr    = totalRecords >= 1_000_000
    ? (totalRecords / 1_000_000).toFixed(2) + 'M'
    : totalRecords >= 1_000
    ? Math.round(totalRecords / 1_000) + 'k'
    : totalRecords.toString();

  return (
    <div className="relative w-full overflow-hidden" style={{ height: 'calc(100vh - 64px)', background: '#03030c' }}>

      {/* Top-left title */}
      <div className="absolute top-5 left-6 z-10 pointer-events-none select-none">
        <div style={{ color: 'rgba(255,255,255,0.30)', fontSize: 10, letterSpacing: '0.4em', textTransform: 'uppercase', fontWeight: 300 }}>CARFIX</div>
        <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 300, marginTop: 2 }}>Knowledge Graph</div>
        <div style={{ color: 'rgba(255,255,255,0.20)', fontSize: 11, marginTop: 5 }}>
          {NODE_DEFS.length} clusters · <span style={{ color: 'rgba(255,255,255,0.45)' }}>{totalStr} records</span> · {refreshStr}
        </div>
      </div>

      {/* Refresh */}
      <button onClick={handleRefresh} className="absolute top-5 right-6 z-10"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8, color: 'rgba(255,255,255,0.40)', fontSize: 11, padding: '5px 12px', cursor: 'pointer', letterSpacing: '0.08em' }}>
        ↺ Refresh
      </button>

      {/* Canvas */}
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }}
        onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} />

      {/* Hover tooltip */}
      {hovNode && (
        <div className="absolute bottom-6 left-6 rounded-xl pointer-events-none select-none"
          style={{ background: 'rgba(3,3,12,0.90)', border: `1px solid ${hovNode.color}40`, backdropFilter: 'blur(14px)', padding: '14px 18px', minWidth: 220 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: hovNode.color, boxShadow: `0 0 8px ${hovNode.color}`, flexShrink: 0 }} />
            <span style={{ color: '#fff', fontWeight: 600, fontSize: 13, letterSpacing: '0.05em' }}>{hovNode.label}</span>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, margin: '0 0 12px 18px' }}>{hovNode.sublabel}</p>
          <p style={{ color: hovNode.color, fontFamily: 'monospace', fontSize: 28, fontWeight: 700, lineHeight: 1, margin: 0 }}>{hovNode.count.toLocaleString()}</p>
          <p style={{ color: 'rgba(255,255,255,0.22)', fontSize: 11, marginTop: 4 }}>records in system</p>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-6 right-6 z-10 pointer-events-none select-none"
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
        {NODE_DEFS.map(def => (
          <div key={def.id} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: def.color, boxShadow: `0 0 4px ${def.color}`, flexShrink: 0 }} />
            <span style={{ color: 'rgba(255,255,255,0.30)', fontSize: 10, fontWeight: 300 }}>{def.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
