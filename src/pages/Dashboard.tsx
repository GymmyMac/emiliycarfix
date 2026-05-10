import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

/* ─── Node definitions ─── */
const NODE_DEFS = [
  { id: 'emily',    label: 'Emily',    sublabel: 'AI Director',      color: '#f59e0b' },
  { id: 'ag',       label: 'AG',       sublabel: 'Automation Ops',   color: '#14b8a6' },
  { id: 'campaign', label: 'Campaign', sublabel: 'Social·Email·SMS', color: '#f43f5e' },
  { id: 'content',  label: 'SEO/AEO', sublabel: 'Content Pipeline',  color: '#3b82f6' },
  { id: 'enrich',   label: 'Enrich',  sublabel: 'AEO Pipeline',      color: '#84cc16' },
  { id: 'parts',    label: 'Parts',   sublabel: 'Catalogue',         color: '#10b981' },
  { id: 'vehicles', label: 'Vehicles', sublabel: 'Fleet & Fitment',  color: '#06b6d4' },
  { id: 'brain',    label: 'Brain',   sublabel: 'Patterns & DTC',    color: '#8b5cf6' },
  { id: 'youtube',  label: 'YouTube', sublabel: 'Videos & Maps',     color: '#ef4444' },
  { id: 'vector',   label: 'Vector',  sublabel: 'Knowledge Index',   color: '#ec4899' },
  { id: 'intel',    label: 'Intel',   sublabel: 'Competitor Data',   color: '#f97316' },
  { id: 'memory',   label: 'Memory',  sublabel: 'Emily Learning',    color: '#a78bfa' },
];

const EDGES: [string, string][] = [
  ['ag', 'emily'], ['ag', 'campaign'],
  ['emily', 'campaign'], ['emily', 'content'], ['emily', 'brain'], ['emily', 'vector'],
  ['campaign', 'vector'], ['content', 'vector'], ['content', 'intel'],
  ['parts', 'enrich'], ['enrich', 'content'],
  ['brain', 'content'], ['brain', 'vector'],
  ['youtube', 'vehicles'], ['vehicles', 'parts'],
  ['intel', 'brain'], ['memory', 'emily'], ['memory', 'brain'],
];

/* ─── Realtime table → animation mapping ─── */
const TABLE_EVENTS: Record<string, { src: string; tgt: string; label: string }[]> = {
  emily_runs:               [{ src: 'ag',      tgt: 'emily',    label: 'Emily run started' }],
  mkt_seo_queue:            [{ src: 'emily',   tgt: 'content',  label: 'SEO article generated' }],
  mkt_content_queue:        [{ src: 'emily',   tgt: 'campaign', label: 'Campaign content created' }],
  partslot_aeo_queue:       [{ src: 'parts',   tgt: 'enrich',   label: 'AEO item queued' }],
  mkt_vectordb_documents:   [{ src: 'content', tgt: 'vector',   label: 'Knowledge indexed' }],
  part_enrichment_staging:  [{ src: 'enrich',  tgt: 'content',  label: 'Part enriched' }],
  mkt_scheduler_log:        [{ src: 'ag',      tgt: 'emily',    label: 'AG scheduler ran' }],
  competitor_keywords:      [{ src: 'intel',   tgt: 'brain',    label: 'Competitor keyword tracked' }],
  emily_memory:             [{ src: 'memory',  tgt: 'emily',    label: 'Emily memory updated' }],
};

const FALLBACK: Record<string, number> = {
  emily: 437, ag: 18034, campaign: 5691, content: 634, enrich: 7234,
  parts: 58992, vehicles: 42253, brain: 24442, youtube: 246301,
  vector: 27966, intel: 5521, memory: 74,
};

interface PhysicsNode {
  id: string; label: string; sublabel: string; color: string;
  count: number; radius: number;
  x: number; y: number; vx: number; vy: number; pulse: number;
}

interface LiveParticle {
  id: string; srcId: string; tgtId: string; color: string;
  t: number; speed: number; arcDir: number; size: number;
}

interface EventLog {
  id: string; label: string; color: string; timeStr: string;
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
    const angle = (i / NODE_DEFS.length) * Math.PI * 2 - Math.PI / 2;
    const spread = Math.min(W, H) * 0.28;
    const count = counts[def.id] || 500;
    const radius = 16 + 42 * (Math.log10(count + 1) / Math.log10(maxCount + 1));
    return {
      ...def, count, radius,
      x: cx + Math.cos(angle) * spread + (Math.random() - 0.5) * 80,
      y: cy + Math.sin(angle) * spread + (Math.random() - 0.5) * 80,
      vx: (Math.random() - 0.5) * 1.2, vy: (Math.random() - 0.5) * 1.2,
      pulse: (i / NODE_DEFS.length) * Math.PI * 2,
    };
  });
}

/* ─── Quadratic bezier point ─── */
function qbez(t: number, p0: number, p1: number, p2: number) {
  return (1-t)*(1-t)*p0 + 2*(1-t)*t*p1 + t*t*p2;
}

export default function Dashboard() {
  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const nodesRef       = useRef<PhysicsNode[]>([]);
  const animRef        = useRef<number>(0);
  const lastTimeRef    = useRef<number>(0);
  const hovIdRef       = useRef<string | null>(null);
  const particlesRef   = useRef<LiveParticle[]>([]);
  const boostsRef      = useRef<Record<string, number>>({});
  const eventLogRef    = useRef<EventLog[]>([]);

  const [hovNode, setHovNode]           = useState<PhysicsNode | null>(null);
  const [eventLog, setEventLog]         = useState<EventLog[]>([]);
  const [isLive, setIsLive]             = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);
  const [lastRefresh, setLastRefresh]   = useState<Date>(new Date());

  /* ── Canvas resize ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const sync = () => {
      const p = canvas.parentElement;
      if (!p) return;
      if (canvas.width !== p.clientWidth || canvas.height !== p.clientHeight) {
        canvas.width = p.clientWidth; canvas.height = p.clientHeight;
      }
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(canvas.parentElement!);
    return () => ro.disconnect();
  }, []);

  /* ── Init ── */
  useEffect(() => {
    const W = canvasRef.current?.width || 1000;
    const H = canvasRef.current?.height || 700;
    nodesRef.current = buildNodes(FALLBACK, W, H);
    setTotalRecords(Object.values(FALLBACK).reduce((a, b) => a + b, 0));
  }, []);

  /* ── Live event dispatcher ── */
  const fireEvent = (tableName: string) => {
    const defs = TABLE_EVENTS[tableName];
    if (!defs) return;
    defs.forEach(({ src, tgt, label }) => {
      const srcNode = NODE_DEFS.find(n => n.id === src);
      const color = srcNode?.color || '#ffffff';

      /* Cap particles at 30 */
      if (particlesRef.current.length < 30) {
        particlesRef.current.push({
          id: Math.random().toString(36).slice(2),
          srcId: src, tgtId: tgt, color,
          t: 0,
          speed: 0.006 + Math.random() * 0.004,
          arcDir: Math.random() > 0.5 ? 1 : -1,
          size: 5 + Math.random() * 3,
        });
      }

      /* Boost source node glow */
      boostsRef.current[src] = 1.0;

      /* Event log (keep last 5) */
      const entry: EventLog = {
        id: Math.random().toString(36).slice(2),
        label,
        color,
        timeStr: new Date().toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      };
      eventLogRef.current = [entry, ...eventLogRef.current].slice(0, 5);
      setEventLog([...eventLogRef.current]);
    });
  };

  /* ── Supabase fetch ── */
  const fetchCounts = async () => {
    try {
      const [
        emilyRuns, agRuns, campaignQ, seoQ, aeoQ,
        enrichQ, vmapQ, partsQ, brainObs, brainDtc, brainPhys,
        ytVids, ytMaps, vehGen, userVeh,
        vectorDocs, compKw, memQ, pendQ,
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
      const W = canvasRef.current?.width || 1000;
      const H = canvasRef.current?.height || 700;
      nodesRef.current = buildNodes(c, W, H);
      setTotalRecords(Object.values(c).reduce((a, b) => a + b, 0));
      setLastRefresh(new Date());
    } catch (err) { console.warn('Graph fetch error:', err); }
  };

  useEffect(() => { fetchCounts(); }, []);

  /* ── Supabase Realtime subscriptions ── */
  useEffect(() => {
    const tables = Object.keys(TABLE_EVENTS);
    let channel = supabase.channel('knowledge-graph-live');

    tables.forEach(table => {
      channel = channel.on(
        'postgres_changes' as any,
        { event: 'INSERT', schema: 'public', table },
        () => { fireEvent(table); }
      );
    });

    channel.subscribe((status) => {
      setIsLive(status === 'SUBSCRIBED');
    });

    return () => { supabase.removeChannel(channel); };
  }, []);

  /* ── Animation + physics loop ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const REPULSION = 16000, SPRING_K = 0.014, DAMPING = 0.84, CENTER_PULL = 0.004;

    function tick(time: number) {
      const dt = Math.min((time - lastTimeRef.current) / 16.67, 3);
      lastTimeRef.current = time;

      const nodes = nodesRef.current;
      const W = canvas.width, H = canvas.height;
      const cx = W / 2, cy = H / 2;
      const REST = Math.min(W, H) * 0.24;

      /* Physics */
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i]; let fx = 0, fy = 0;
        for (let j = 0; j < nodes.length; j++) {
          if (i === j) continue;
          const b = nodes[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx*dx + dy*dy + 0.1, d = Math.sqrt(d2);
          const f = REPULSION / d2;
          fx += (dx/d)*f; fy += (dy/d)*f;
        }
        EDGES.forEach(([s, t]) => {
          const oid = s === a.id ? t : t === a.id ? s : null;
          if (!oid) return;
          const other = nodes.find(n => n.id === oid);
          if (!other) return;
          const dx = other.x - a.x, dy = other.y - a.y;
          const d = Math.sqrt(dx*dx + dy*dy) || 1;
          const f = SPRING_K * (d - REST);
          fx += (dx/d)*f; fy += (dy/d)*f;
        });
        fx -= CENTER_PULL * (a.x - cx); fy -= CENTER_PULL * (a.y - cy);
        a.vx = (a.vx + fx*dt) * DAMPING; a.vy = (a.vy + fy*dt) * DAMPING;
        a.pulse += 0.02; a.x += a.vx*dt; a.y += a.vy*dt;
        const m = a.radius + 16;
        if (a.x < m)     { a.x = m;     a.vx =  Math.abs(a.vx)*0.4; }
        if (a.x > W - m) { a.x = W - m; a.vx = -Math.abs(a.vx)*0.4; }
        if (a.y < m)     { a.y = m;     a.vy =  Math.abs(a.vy)*0.4; }
        if (a.y > H - m) { a.y = H - m; a.vy = -Math.abs(a.vy)*0.4; }
      }

      /* Decay boosts */
      Object.keys(boostsRef.current).forEach(id => {
        boostsRef.current[id] *= 0.94;
        if (boostsRef.current[id] < 0.01) delete boostsRef.current[id];
      });

      /* Background */
      ctx.fillStyle = 'rgba(3,3,12,0.78)';
      ctx.fillRect(0, 0, W, H);

      /* Static edges */
      EDGES.forEach(([srcId, tgtId]) => {
        const src = nodes.find(n => n.id === srcId);
        const tgt = nodes.find(n => n.id === tgtId);
        if (!src || !tgt) return;
        const grad = ctx.createLinearGradient(src.x, src.y, tgt.x, tgt.y);
        grad.addColorStop(0,   src.color + '40');
        grad.addColorStop(0.5, '#ffffff10');
        grad.addColorStop(1,   tgt.color + '40');
        ctx.beginPath(); ctx.moveTo(src.x, src.y); ctx.lineTo(tgt.x, tgt.y);
        ctx.strokeStyle = grad; ctx.lineWidth = 1.2; ctx.stroke();
      });

      /* Live arc particles */
      particlesRef.current = particlesRef.current.filter(ev => ev.t < 1);
      particlesRef.current.forEach(ev => {
        const src = nodes.find(n => n.id === ev.srcId);
        const tgt = nodes.find(n => n.id === ev.tgtId);
        if (!src || !tgt) { ev.t = 1; return; }
        ev.t += ev.speed * dt;
        const t = Math.min(ev.t, 1);

        /* Bezier control point perpendicular to edge */
        const mx = (src.x + tgt.x) / 2, my = (src.y + tgt.y) / 2;
        const edx = tgt.x - src.x, edy = tgt.y - src.y;
        const elen = Math.sqrt(edx*edx + edy*edy) || 1;
        const ah = Math.min(110, elen * 0.38);
        const cpx = mx + (-edy / elen) * ah * ev.arcDir;
        const cpy = my + (edx  / elen) * ah * ev.arcDir;

        const bx = qbez(t, src.x, cpx, tgt.x);
        const by = qbez(t, src.y, cpy, tgt.y);

        /* Fade in/out */
        const alpha = t < 0.12 ? t / 0.12 : t > 0.88 ? (1 - t) / 0.12 : 1;

        /* Trail */
        if (t > 0.04) {
          const t2 = t - 0.04;
          const tx2 = qbez(t2, src.x, cpx, tgt.x);
          const ty2 = qbez(t2, src.y, cpy, tgt.y);
          ctx.save();
          ctx.globalAlpha = alpha * 0.25;
          ctx.beginPath(); ctx.arc(tx2, ty2, ev.size * 0.55, 0, Math.PI * 2);
          ctx.fillStyle = ev.color; ctx.fill();
          ctx.restore();
        }

        /* Head */
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.shadowBlur = 22; ctx.shadowColor = ev.color;
        ctx.beginPath(); ctx.arc(bx, by, ev.size, 0, Math.PI * 2);
        ctx.fillStyle = ev.color; ctx.fill();
        ctx.restore();
      });

      /* Nodes */
      nodes.forEach(node => {
        const isHov  = node.id === hovIdRef.current;
        const boost  = boostsRef.current[node.id] || 0;
        const pulse  = Math.sin(node.pulse) * 0.09 + 1;
        const r      = node.radius * (isHov ? 1.18 : pulse) * (1 + boost * 0.28);
        const glowR  = r * (isHov || boost > 0.1 ? 3.2 : 2.2);

        const halo = ctx.createRadialGradient(node.x, node.y, r*0.2, node.x, node.y, glowR);
        halo.addColorStop(0, node.color + (isHov || boost > 0.3 ? '60' : '28'));
        halo.addColorStop(1, 'transparent');
        ctx.beginPath(); ctx.arc(node.x, node.y, glowR, 0, Math.PI * 2);
        ctx.fillStyle = halo; ctx.fill();

        ctx.save();
        ctx.shadowBlur  = isHov || boost > 0.3 ? 38 : 16;
        ctx.shadowColor = node.color;
        const sphere = ctx.createRadialGradient(node.x - r*0.28, node.y - r*0.28, 0, node.x, node.y, r);
        sphere.addColorStop(0,    node.color + 'ff');
        sphere.addColorStop(0.55, node.color + 'cc');
        sphere.addColorStop(1,    node.color + '44');
        ctx.beginPath(); ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle = sphere; ctx.fill();
        ctx.restore();

        ctx.beginPath(); ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = node.color + (boost > 0.3 ? 'ee' : 'aa');
        ctx.lineWidth = isHov ? 2 : 1.4; ctx.stroke();

        const fs = Math.max(9, r * 0.36);
        ctx.save();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowBlur = 7; ctx.shadowColor = 'rgba(0,0,0,0.95)';
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${fs}px -apple-system, sans-serif`;
        ctx.fillText(node.label, node.x, node.y - fs * 0.4);
        ctx.restore();

        ctx.save();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(255,255,255,0.60)';
        ctx.font = `${Math.max(7, r * 0.25)}px -apple-system, sans-serif`;
        ctx.fillText(formatCount(node.count), node.x, node.y + fs * 0.7);
        ctx.restore();
      });

      animRef.current = requestAnimationFrame(tick);
    }

    animRef.current = requestAnimationFrame(tick);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, []);

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top)  * (canvas.height / rect.height);
    const hit = nodesRef.current.find(n => {
      const dx = n.x - mx, dy = n.y - my;
      return Math.sqrt(dx*dx + dy*dy) <= n.radius + 14;
    }) ?? null;
    hovIdRef.current = hit?.id ?? null;
    setHovNode(hit ? { ...hit } : null);
  }
  function handleMouseLeave() { hovIdRef.current = null; setHovNode(null); }

  function handleRefresh() {
    const W = canvasRef.current?.width || 1000;
    const H = canvasRef.current?.height || 700;
    nodesRef.current = buildNodes(FALLBACK, W, H);
    fetchCounts();
  }

  const totalStr = totalRecords >= 1_000_000
    ? (totalRecords / 1_000_000).toFixed(2) + 'M'
    : Math.round(totalRecords / 1_000) + 'k';

  return (
    <div className="relative w-full overflow-hidden" style={{ height: 'calc(100vh - 64px)', background: '#03030c' }}>

      {/* Title */}
      <div className="absolute top-5 left-6 z-10 pointer-events-none select-none">
        <div style={{ color: 'rgba(255,255,255,0.28)', fontSize: 10, letterSpacing: '0.4em', textTransform: 'uppercase', fontWeight: 300 }}>CARFIX</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
          <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 300 }}>Knowledge Graph</div>
          {/* LIVE indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: isLive ? '#22c55e' : '#6b7280',
              boxShadow: isLive ? '0 0 6px #22c55e' : 'none',
              animation: isLive ? 'pulse 2s infinite' : 'none',
            }} />
            <span style={{ color: isLive ? '#22c55e' : '#6b7280', fontSize: 9, letterSpacing: '0.15em', fontWeight: 300 }}>
              {isLive ? 'LIVE' : 'CONNECTING'}
            </span>
          </div>
        </div>
        <div style={{ color: 'rgba(255,255,255,0.18)', fontSize: 11, marginTop: 4 }}>
          {NODE_DEFS.length} clusters · <span style={{ color: 'rgba(255,255,255,0.40)' }}>{totalStr} records</span>
        </div>

        {/* Activity feed */}
        {eventLog.length > 0 && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {eventLog.map((ev, i) => (
              <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 1 - i * 0.18 }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: ev.color, boxShadow: `0 0 4px ${ev.color}`, flexShrink: 0 }} />
                <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10 }}>{ev.label}</span>
                <span style={{ color: 'rgba(255,255,255,0.18)', fontSize: 9 }}>{ev.timeStr}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Refresh */}
      <button onClick={handleRefresh} className="absolute top-5 right-6 z-10"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8, color: 'rgba(255,255,255,0.38)', fontSize: 11, padding: '5px 12px', cursor: 'pointer', letterSpacing: '0.08em' }}>
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
            <span style={{ color: '#fff', fontWeight: 600, fontSize: 13 }}>{hovNode.label}</span>
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
            <span style={{ color: 'rgba(255,255,255,0.28)', fontSize: 10, fontWeight: 300 }}>{def.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
