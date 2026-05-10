import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

/* ─── Knowledge cluster definitions ─── */
const NODE_DEFS = [
  { id: 'emily',      label: 'Emily',       sublabel: 'AI Director',       color: '#f59e0b' },
  { id: 'content',    label: 'Content',     sublabel: 'SEO · AEO',          color: '#3b82f6' },
  { id: 'catalogue',  label: 'Catalogue',   sublabel: 'Parts & Fitment',    color: '#10b981' },
  { id: 'brain',      label: 'Brain',       sublabel: 'Patterns & DTC',     color: '#8b5cf6' },
  { id: 'youtube',    label: 'YouTube',     sublabel: 'Videos & Maps',      color: '#ef4444' },
  { id: 'vehicles',   label: 'Vehicles',    sublabel: 'Fleet & Owners',     color: '#06b6d4' },
  { id: 'vectorstore',label: 'Vector',      sublabel: 'Knowledge Index',    color: '#ec4899' },
  { id: 'intel',      label: 'Intel',       sublabel: 'Competitor Data',    color: '#f97316' },
];

const EDGES: [string, string][] = [
  ['emily',       'content'],
  ['emily',       'brain'],
  ['emily',       'vectorstore'],
  ['content',     'vectorstore'],
  ['content',     'intel'],
  ['catalogue',   'content'],
  ['catalogue',   'brain'],
  ['brain',       'content'],
  ['brain',       'vectorstore'],
  ['youtube',     'vehicles'],
  ['vehicles',    'catalogue'],
  ['intel',       'brain'],
  ['emily',       'vehicles'],
];

/* ─── Fallback counts while Supabase loads ─── */
const FALLBACK: Record<string, number> = {
  emily:       847,
  content:     583,
  catalogue:   8511491,
  brain:       24442,
  youtube:     246301,
  vehicles:    68,
  vectorstore: 27866,
  intel:       5521,
};

interface PhysicsNode {
  id: string;
  label: string;
  sublabel: string;
  color: string;
  count: number;
  radius: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  pulse: number;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return Math.round(n / 1_000) + 'k';
  return n.toString();
}

function buildNodes(counts: Record<string, number>, W: number, H: number): PhysicsNode[] {
  const cx = W / 2;
  const cy = H / 2;
  const maxCount = Math.max(...Object.values(counts).filter(Boolean), 1);
  return NODE_DEFS.map((def, i) => {
    const angle  = (i / NODE_DEFS.length) * Math.PI * 2 - Math.PI / 2;
    const spread = Math.min(W, H) * 0.29;
    const count  = counts[def.id] || 1000;
    const radius = 20 + 38 * (Math.log10(count + 1) / Math.log10(maxCount + 1));
    return {
      ...def,
      count,
      radius,
      x:     cx + Math.cos(angle) * spread + (Math.random() - 0.5) * 60,
      y:     cy + Math.sin(angle) * spread + (Math.random() - 0.5) * 60,
      vx:    (Math.random() - 0.5) * 1.5,
      vy:    (Math.random() - 0.5) * 1.5,
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
  const [hovNode, setHovNode] = useState<PhysicsNode | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  /* ── Resize canvas to container ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const syncSize = () => {
      const p = canvas.parentElement;
      if (!p) return;
      const W = p.clientWidth;
      const H = p.clientHeight;
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width  = W;
        canvas.height = H;
      }
    };

    syncSize();
    const ro = new ResizeObserver(syncSize);
    ro.observe(canvas.parentElement!);
    return () => ro.disconnect();
  }, []);

  /* ── Init nodes with fallback counts ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    const W = canvas?.width  || 900;
    const H = canvas?.height || 600;
    nodesRef.current = buildNodes(FALLBACK, W, H);
  }, []);

  /* ── Fetch live counts from Supabase ── */
  const fetchCounts = async () => {
    try {
      const [
        emilyRuns, seoQ, aeoQ, vectorDocs,
        ytVids, ytMaps, brainObs, brainDtc, brainPhys,
        compKw, vehGen, userVeh,
      ] = await Promise.all([
        supabase.from('emily_runs')               .select('*', { count: 'exact', head: true }),
        supabase.from('mkt_seo_queue')            .select('*', { count: 'exact', head: true }),
        supabase.from('partslot_aeo_queue')       .select('*', { count: 'exact', head: true }),
        supabase.from('mkt_vectordb_documents')   .select('*', { count: 'exact', head: true }),
        supabase.from('youtube_videos')           .select('*', { count: 'exact', head: true }),
        supabase.from('youtube_video_vehicles')   .select('*', { count: 'exact', head: true }),
        supabase.from('brain_observation_patterns').select('*', { count: 'exact', head: true }),
        supabase.from('brain_dtc_codes')          .select('*', { count: 'exact', head: true }),
        supabase.from('brain_physics_patterns')   .select('*', { count: 'exact', head: true }),
        supabase.from('competitor_keywords')      .select('*', { count: 'exact', head: true }),
        supabase.from('vehicle_generations')      .select('*', { count: 'exact', head: true }),
        supabase.from('user_vehicles')            .select('*', { count: 'exact', head: true }),
      ]);

      const newCounts: Record<string, number> = {
        emily:       emilyRuns.count  || FALLBACK.emily,
        content:     (seoQ.count || 0) + (aeoQ.count || 0),
        catalogue:   8_511_491,
        brain:       (brainObs.count || 0) + (brainDtc.count || 0) + (brainPhys.count || 0),
        youtube:     (ytVids.count   || 0) + (ytMaps.count   || 0),
        vehicles:    (vehGen.count   || 0) + (userVeh.count  || 0),
        vectorstore: vectorDocs.count || FALLBACK.vectorstore,
        intel:       compKw.count    || FALLBACK.intel,
      };

      const canvas = canvasRef.current;
      const W = canvas?.width  || 900;
      const H = canvas?.height || 600;
      nodesRef.current = buildNodes(newCounts, W, H);
      setLastRefresh(new Date());
    } catch (err) {
      console.warn('Dashboard graph fetch error:', err);
    }
  };

  useEffect(() => { fetchCounts(); }, []);

  /* ── Animation loop ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const REPULSION   = 14000;
    const SPRING_K    = 0.016;
    const DAMPING     = 0.85;
    const CENTER_PULL = 0.005;

    function tick(time: number) {
      const dt  = Math.min((time - lastTimeRef.current) / 16.67, 3);
      lastTimeRef.current = time;

      const nodes = nodesRef.current;
      const W     = canvas.width;
      const H     = canvas.height;
      const cx    = W / 2;
      const cy    = H / 2;
      const REST  = Math.min(W, H) * 0.27;

      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        let fx = 0, fy = 0;

        for (let j = 0; j < nodes.length; j++) {
          if (i === j) continue;
          const b  = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
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
          const dx = other.x - a.x;
          const dy = other.y - a.y;
          const d  = Math.sqrt(dx * dx + dy * dy) || 1;
          const f  = SPRING_K * (d - REST);
          fx += (dx / d) * f;
          fy += (dy / d) * f;
        });

        fx -= CENTER_PULL * (a.x - cx);
        fy -= CENTER_PULL * (a.y - cy);

        a.vx = (a.vx + fx * dt) * DAMPING;
        a.vy = (a.vy + fy * dt) * DAMPING;
        a.pulse += 0.022;

        a.x += a.vx * dt;
        a.y += a.vy * dt;

        const m = a.radius + 18;
        if (a.x < m)     { a.x = m;     a.vx =  Math.abs(a.vx) * 0.4; }
        if (a.x > W - m) { a.x = W - m; a.vx = -Math.abs(a.vx) * 0.4; }
        if (a.y < m)     { a.y = m;     a.vy =  Math.abs(a.vy) * 0.4; }
        if (a.y > H - m) { a.y = H - m; a.vy = -Math.abs(a.vy) * 0.4; }
      }

      ctx.fillStyle = 'rgba(3, 3, 12, 0.80)';
      ctx.fillRect(0, 0, W, H);

      EDGES.forEach(([srcId, tgtId]) => {
        const src = nodes.find(n => n.id === srcId);
        const tgt = nodes.find(n => n.id === tgtId);
        if (!src || !tgt) return;

        const grad = ctx.createLinearGradient(src.x, src.y, tgt.x, tgt.y);
        grad.addColorStop(0,   src.color + '55');
        grad.addColorStop(0.5, '#ffffff18');
        grad.addColorStop(1,   tgt.color + '55');

        ctx.beginPath();
        ctx.moveTo(src.x, src.y);
        ctx.lineTo(tgt.x, tgt.y);
        ctx.strokeStyle = grad;
        ctx.lineWidth   = 1.5;
        ctx.stroke();

        const phase = (srcId.charCodeAt(0) * 0.07 + tgtId.charCodeAt(0) * 0.03);
        const t     = ((time / 2200) + phase) % 1;
        const px    = src.x + (tgt.x - src.x) * t;
        const py    = src.y + (tgt.y - src.y) * t;
        ctx.beginPath();
        ctx.arc(px, py, 2.8, 0, Math.PI * 2);
        ctx.fillStyle = src.color + 'dd';
        ctx.fill();
      });

      nodes.forEach(node => {
        const isHov  = node.id === hovIdRef.current;
        const pulse  = Math.sin(node.pulse) * 0.1 + 1;
        const r      = node.radius * (isHov ? 1.18 : pulse);
        const glowR  = r * (isHov ? 3.2 : 2.4);

        const halo = ctx.createRadialGradient(node.x, node.y, r * 0.2, node.x, node.y, glowR);
        halo.addColorStop(0, node.color + (isHov ? '55' : '30'));
        halo.addColorStop(1, 'transparent');
        ctx.beginPath();
        ctx.arc(node.x, node.y, glowR, 0, Math.PI * 2);
        ctx.fillStyle = halo;
        ctx.fill();

        ctx.save();
        ctx.shadowBlur  = isHov ? 36 : 18;
        ctx.shadowColor = node.color;
        const sphere = ctx.createRadialGradient(
          node.x - r * 0.28, node.y - r * 0.28, 0,
          node.x, node.y, r
        );
        sphere.addColorStop(0,    node.color + 'ff');
        sphere.addColorStop(0.55, node.color + 'cc');
        sphere.addColorStop(1,    node.color + '44');
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle = sphere;
        ctx.fill();
        ctx.restore();

        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = node.color + 'bb';
        ctx.lineWidth   = isHov ? 2.2 : 1.5;
        ctx.stroke();

        const fs = Math.max(10, r * 0.38);
        ctx.save();
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowBlur   = 8;
        ctx.shadowColor  = 'rgba(0,0,0,0.9)';
        ctx.fillStyle    = '#ffffff';
        ctx.font         = `bold ${fs}px -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.fillText(node.label, node.x, node.y - fs * 0.38);
        ctx.restore();

        ctx.save();
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle    = 'rgba(255,255,255,0.60)';
        ctx.font         = `${Math.max(8, r * 0.26)}px -apple-system, sans-serif`;
        ctx.fillText(formatCount(node.count), node.x, node.y + fs * 0.72);
        ctx.restore();
      });

      animRef.current = requestAnimationFrame(tick);
    }

    animRef.current = requestAnimationFrame(tick);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, []);

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx     = (e.clientX - rect.left)  * scaleX;
    const my     = (e.clientY - rect.top)   * scaleY;
    const hit    = nodesRef.current.find(n => {
      const dx = n.x - mx, dy = n.y - my;
      return Math.sqrt(dx * dx + dy * dy) <= n.radius + 14;
    }) ?? null;
    hovIdRef.current = hit?.id ?? null;
    setHovNode(hit ? { ...hit } : null);
  }

  function handleMouseLeave() {
    hovIdRef.current = null;
    setHovNode(null);
  }

  function handleRefresh() {
    const canvas = canvasRef.current;
    const W = canvas?.width  || 900;
    const H = canvas?.height || 600;
    nodesRef.current = buildNodes(FALLBACK, W, H);
    fetchCounts();
  }

  const refreshStr = lastRefresh.toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' });

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ height: 'calc(100vh - 64px)', background: '#03030c' }}
    >
      <div className="absolute top-5 left-6 z-10 pointer-events-none select-none">
        <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, letterSpacing: '0.4em', textTransform: 'uppercase', fontWeight: 300 }}>
          CARFIX
        </div>
        <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 300, marginTop: 2 }}>
          Knowledge Graph
        </div>
        <div style={{ color: 'rgba(255,255,255,0.22)', fontSize: 11, marginTop: 4 }}>
          Live system intelligence · {refreshStr}
        </div>
      </div>

      <button
        onClick={handleRefresh}
        className="absolute top-5 right-6 z-10"
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8,
          color: 'rgba(255,255,255,0.45)',
          fontSize: 11,
          padding: '5px 12px',
          cursor: 'pointer',
          letterSpacing: '0.08em',
        }}
      >
        ↺ Refresh
      </button>

      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />

      {hovNode && (
        <div
          className="absolute bottom-6 left-6 rounded-xl pointer-events-none select-none"
          style={{
            background: 'rgba(3, 3, 12, 0.88)',
            border: `1px solid ${hovNode.color}45`,
            backdropFilter: 'blur(14px)',
            padding: '14px 18px',
            minWidth: 210,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
              background: hovNode.color,
              boxShadow: `0 0 8px ${hovNode.color}`,
            }} />
            <span style={{ color: '#fff', fontWeight: 600, fontSize: 13, letterSpacing: '0.05em' }}>
              {hovNode.label}
            </span>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.38)', fontSize: 11, margin: '0 0 12px 18px' }}>
            {hovNode.sublabel}
          </p>
          <p style={{ color: hovNode.color, fontFamily: 'monospace', fontSize: 26, fontWeight: 700, lineHeight: 1, margin: 0 }}>
            {hovNode.count.toLocaleString()}
          </p>
          <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11, marginTop: 4 }}>
            records in system
          </p>
        </div>
      )}

      <div
        className="absolute bottom-6 right-6 z-10 pointer-events-none select-none"
        style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
      >
        {NODE_DEFS.map(def => (
          <div key={def.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
              background: def.color,
              boxShadow: `0 0 5px ${def.color}`,
            }} />
            <span style={{ color: 'rgba(255,255,255,0.32)', fontSize: 11, fontWeight: 300 }}>
              {def.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
