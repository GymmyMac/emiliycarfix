import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

/* ── Node / Edge definitions ─────────────────────────────────────────────── */
const NODE_DEFS = [
  { id:'emily',    label:'Emily',    sublabel:'AI Director',      color:'#f59e0b' },
  { id:'ag',       label:'AG',       sublabel:'Automation Ops',   color:'#14b8a6' },
  { id:'campaign', label:'Campaign', sublabel:'Social·Email·SMS', color:'#f43f5e' },
  { id:'content',  label:'SEO/AEO', sublabel:'Content Pipeline',  color:'#3b82f6' },
  { id:'enrich',   label:'Enrich',  sublabel:'AEO Pipeline',      color:'#84cc16' },
  { id:'parts',    label:'Parts',   sublabel:'Catalogue',         color:'#10b981' },
  { id:'vehicles', label:'Vehicles',sublabel:'Fleet & Fitment',   color:'#06b6d4' },
  { id:'brain',    label:'Brain',   sublabel:'Patterns & DTC',    color:'#8b5cf6' },
  { id:'youtube',  label:'YouTube', sublabel:'Videos & Maps',     color:'#ef4444' },
  { id:'vector',   label:'Vector',  sublabel:'Knowledge Index',   color:'#ec4899' },
  { id:'intel',    label:'Intel',   sublabel:'Competitor Data',   color:'#f97316' },
  { id:'memory',   label:'Memory',  sublabel:'Emily Learning',    color:'#a78bfa' },
] as const;

const EDGES: [string,string][] = [
  ['ag','emily'],['emily','campaign'],['emily','content'],['emily','enrich'],
  ['content','vector'],['parts','enrich'],['enrich','content'],
  ['vehicles','parts'],['vehicles','brain'],['youtube','brain'],
  ['intel','brain'],['intel','content'],['brain','emily'],
  ['memory','emily'],['vector','emily'],['campaign','emily'],
];

const TABLE_MAP: Record<string,{src:string;tgt:string;label:string}[]> = {
  emily_runs:             [{src:'ag',      tgt:'emily',   label:'Emily run started'}],
  mkt_seo_queue:          [{src:'emily',   tgt:'content', label:'SEO article generated'}],
  mkt_content_queue:      [{src:'emily',   tgt:'campaign',label:'Campaign content created'}],
  partslot_aeo_queue:     [{src:'parts',   tgt:'enrich',  label:'AEO item queued'}],
  mkt_vectordb_documents: [{src:'content', tgt:'vector',  label:'Knowledge indexed'}],
  part_enrichment_staging:[{src:'enrich',  tgt:'content', label:'Part enriched'}],
  mkt_scheduler_log:      [{src:'ag',      tgt:'emily',   label:'AG scheduler ran'}],
  competitor_keywords:    [{src:'intel',   tgt:'brain',   label:'Competitor keyword tracked'}],
  emily_memory:           [{src:'memory',  tgt:'emily',   label:'Emily memory updated'}],
};

const FALLBACK: Record<string,number> = {
  emily:437, ag:18034, campaign:5691, content:634, enrich:7234,
  parts:58992, vehicles:42253, brain:177420, youtube:246301,
  vector:27966, intel:5521, memory:74,
};

/* ── 3D Vector math ──────────────────────────────────────────────────────── */
type V3 = {x:number;y:number;z:number};
const rotX=(v:V3,a:number):V3=>{const c=Math.cos(a),s=Math.sin(a);return{x:v.x,y:v.y*c-v.z*s,z:v.y*s+v.z*c};};
const rotY=(v:V3,a:number):V3=>{const c=Math.cos(a),s=Math.sin(a);return{x:v.x*c+v.z*s,y:v.y,z:-v.x*s+v.z*c};};
const applyRot=(v:V3,rx:number,ry:number):V3=>rotY(rotX(v,rx),ry);
const cross3=(a:V3,b:V3):V3=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const norm3=(v:V3):V3=>{const l=Math.sqrt(v.x*v.x+v.y*v.y+v.z*v.z)||1;return{x:v.x/l,y:v.y/l,z:v.z/l};};
const dot3=(a:V3,b:V3)=>a.x*b.x+a.y*b.y+a.z*b.z;
const slerp3=(a:V3,b:V3,t:number):V3=>{
  const d=Math.max(-1,Math.min(1,dot3(a,b))),om=Math.acos(d);
  if(Math.abs(om)<.001)return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t};
  const so=Math.sin(om);
  return{
    x:(Math.sin((1-t)*om)/so)*a.x+(Math.sin(t*om)/so)*b.x,
    y:(Math.sin((1-t)*om)/so)*a.y+(Math.sin(t*om)/so)*b.y,
    z:(Math.sin((1-t)*om)/so)*a.z+(Math.sin(t*om)/so)*b.z,
  };
};
const fibSphere=(n:number,i:number):V3=>{
  const phi=Math.acos(1-2*(i+.5)/n),theta=Math.PI*(1+Math.sqrt(5))*i;
  return{x:Math.sin(phi)*Math.cos(theta),y:Math.cos(phi),z:Math.sin(phi)*Math.sin(theta)};
};
const project3=(w:V3,cx:number,cy:number,SR:number,FOV:number)=>{
  const scale=FOV/(FOV-w.z);
  return{sx:cx+w.x*SR*scale,sy:cy+w.y*SR*scale,scale,depth:w.z};
};
const hexRgb=(h:string)=>`${parseInt(h.slice(1,3),16)},${parseInt(h.slice(3,5),16)},${parseInt(h.slice(5,7),16)}`;

/* ── Types ───────────────────────────────────────────────────────────────── */
interface GNode{id:string;label:string;sublabel:string;color:string;count:number;baseR:number;pulse:number;u:V3;}
interface GAtom{nid:string;angle:number;speed:number;orbitR:number;b1:V3;b2:V3;size:number;opacity:number;}
interface Particle{src:string;tgt:string;t:number;speed:number;}
interface Feed{id:number;label:string;time:string;}

/* ── Builders ────────────────────────────────────────────────────────────── */
function buildNodes(counts:Record<string,number>):GNode[]{
  const max=Math.max(...Object.values(counts),1);
  return NODE_DEFS.map((d,i)=>{
    const count=counts[d.id]??0;
    return{...d,count,pulse:0,baseR:8+18*(Math.log10(count+1)/Math.log10(max+1)),u:fibSphere(NODE_DEFS.length,i)};
  });
}

function buildAtoms(nodes:GNode[]):GAtom[]{
  const max=Math.max(...nodes.map(n=>n.count),1);
  const atoms:GAtom[]=[];
  nodes.forEach(node=>{
    const logR=Math.log10(node.count+1)/Math.log10(max+1);
    const total=Math.round(6+80*logR);
    const ref:V3=Math.abs(node.u.y)<.9?{x:0,y:1,z:0}:{x:1,y:0,z:0};
    const b1b=norm3(cross3(node.u,ref)),b2b=norm3(cross3(node.u,b1b));
    for(let i=0;i<total;i++){
      const shell=Math.floor(i/18),incl=Math.random()*Math.PI*2,ci=Math.cos(incl),si=Math.sin(incl);
      atoms.push({
        nid:node.id,angle:Math.random()*Math.PI*2,
        speed:(0.002+Math.random()*.0035)*(Math.random()>.5?1:-1),
        orbitR:node.baseR*(1.3+shell*.38+Math.random()*.15),
        b1:{x:b1b.x*ci+b2b.x*si,y:b1b.y*ci+b2b.y*si,z:b1b.z*ci+b2b.z*si},
        b2:{x:-b1b.x*si+b2b.x*ci,y:-b1b.y*si+b2b.y*ci,z:-b1b.z*si+b2b.z*ci},
        size:0.6+Math.random()*.9,opacity:0.14+Math.random()*.28,
      });
    }
  });
  return atoms;
}

/* ── Component ───────────────────────────────────────────────────────────── */
export default function Dashboard(){
  const cvs=useRef<HTMLCanvasElement>(null);
  const rot=useRef({x:-0.3,y:0.4});
  const vel=useRef({x:0,y:0});
  const drag=useRef<{on:boolean;lx:number;ly:number;nid:string|null}>({on:false,lx:0,ly:0,nid:null});
  const nodesR=useRef<GNode[]>([]);
  const atomsR=useRef<GAtom[]>([]);
  const particles=useRef<Particle[]>([]);
  const hoverR=useRef<string|null>(null);
  const fid=useRef(0);
  const raf=useRef(0);
  const lt=useRef(0);

  const [ready,setReady]=useState(false);
  const [feed,setFeed]=useState<Feed[]>([]);
  const [tooltip,setTooltip]=useState<{label:string;count:number;x:number;y:number}|null>(null);
  const [live,setLive]=useState(0);
  const [grabbing,setGrabbing]=useState(false);

  /* Fetch counts */
  useEffect(()=>{
    const TABLES:[string,string][]=[
      ['emily_runs','emily'],['mkt_scheduler_log','ag'],
      ['mkt_content_queue','campaign'],['mkt_seo_queue','content'],
      ['partslot_aeo_queue','enrich'],['youtube_video_mappings','brain'],
      ['sas_catalogue','parts'],['user_vehicles','vehicles'],
      ['mkt_vectordb_documents','vector'],['competitor_keywords','intel'],
      ['emily_memory','memory'],['youtube_videos','youtube'],
    ];
    Promise.all(TABLES.map(([t])=>supabase.from(t).select('*',{count:'exact',head:true})))
      .then(results=>{
        const c:Record<string,number>={};
        results.forEach((r,i)=>{c[TABLES[i][1]]=r.count??FALLBACK[TABLES[i][1]];});
        nodesR.current=buildNodes(c);
        atomsR.current=buildAtoms(nodesR.current);
        setReady(true);
      })
      .catch(()=>{
        nodesR.current=buildNodes(FALLBACK);
        atomsR.current=buildAtoms(nodesR.current);
        setReady(true);
      });
  },[]);

  /* Realtime */
  useEffect(()=>{
    const channels=Object.entries(TABLE_MAP).map(([table,evs])=>
      supabase.channel(`rtg_${table}`)
        .on('postgres_changes',{event:'INSERT',schema:'public',table},()=>{
          evs.forEach(ev=>{
            particles.current.push({src:ev.src,tgt:ev.tgt,t:0,speed:0.003+Math.random()*.003});
            const n=nodesR.current.find(x=>x.id===ev.tgt);
            if(n)n.pulse=1;
            setLive(v=>v+1);
            setFeed(f=>[{id:++fid.current,label:ev.label,time:new Date().toLocaleTimeString()},...f.slice(0,9)]);
          });
        }).subscribe()
    );
    return()=>{channels.forEach(c=>c.unsubscribe());};
  },[]);

  /* Resize observer */
  useEffect(()=>{
    const canvas=cvs.current;if(!canvas)return;
    const ro=new ResizeObserver(()=>{
      const rect=canvas.getBoundingClientRect();
      const dpr=window.devicePixelRatio||1;
      canvas.width=rect.width*dpr;
      canvas.height=rect.height*dpr;
    });
    ro.observe(canvas);
    return()=>ro.disconnect();
  },[]);

  /* Draw loop */
  useEffect(()=>{
    if(!ready)return;
    const canvas=cvs.current;if(!canvas)return;
    const ctx=canvas.getContext('2d');if(!ctx)return;

    const frame=(ts:number)=>{
      const dt=Math.min(ts-lt.current,50);lt.current=ts;
      const dpr=window.devicePixelRatio||1;
      const W=canvas.width/dpr,H=canvas.height/dpr;
      const cx=W/2,cy=H/2,SR=Math.min(W,H)*.32,FOV=3.2;

      if(!drag.current.on){
        /* Apply angular velocity with exponential damping (~0.985 per 16ms frame) */
        rot.current.x+=vel.current.x*dt;
        rot.current.y+=vel.current.y*dt;
        const damp=Math.pow(0.985,dt/16.67);
        vel.current.x*=damp;
        vel.current.y*=damp;
        /* Ambient drift only when nearly stopped */
        const speed=Math.hypot(vel.current.x,vel.current.y);
        if(speed<0.0002)vel.current.y+=(0.00008-vel.current.y)*0.02;
      }
      const rx=rot.current.x,ry=rot.current.y;

      ctx.save();
      ctx.scale(dpr,dpr);
      ctx.clearRect(0,0,W,H);

      /* Atmosphere */
      const atm=ctx.createRadialGradient(cx,cy,SR*.8,cx,cy,SR*1.4);
      atm.addColorStop(0,'rgba(99,102,241,0.07)');atm.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=atm;ctx.beginPath();ctx.arc(cx,cy,SR*1.4,0,Math.PI*2);ctx.fill();

      /* Wireframe sphere */
      ctx.strokeStyle='rgba(99,102,241,0.09)';ctx.lineWidth=.5;
      for(let li=1;li<=5;li++){
        const cp=-1+li/3,sp=Math.sqrt(Math.max(0,1-cp*cp));
        ctx.beginPath();
        for(let j=0;j<=60;j++){
          const th=j/60*Math.PI*2;
          const w=applyRot({x:sp*Math.cos(th),y:cp,z:sp*Math.sin(th)},rx,ry);
          const p=project3(w,cx,cy,SR,FOV);
          j?ctx.lineTo(p.sx,p.sy):ctx.moveTo(p.sx,p.sy);
        }
        ctx.closePath();ctx.stroke();
      }
      for(let li=0;li<8;li++){
        const th=li/8*Math.PI*2;ctx.beginPath();
        for(let j=0;j<=40;j++){
          const ph=j/40*Math.PI;
          const w=applyRot({x:Math.sin(ph)*Math.cos(th),y:Math.cos(ph),z:Math.sin(ph)*Math.sin(th)},rx,ry);
          const p=project3(w,cx,cy,SR,FOV);
          j?ctx.lineTo(p.sx,p.sy):ctx.moveTo(p.sx,p.sy);
        }
        ctx.stroke();
      }

      /* Update state */
      atomsR.current.forEach(a=>{a.angle+=a.speed*dt;});
      nodesR.current.forEach(n=>{n.pulse=Math.max(0,n.pulse-.012*dt);});
      particles.current=particles.current.filter(p=>{p.t+=p.speed*dt;return p.t<1;});

      /* Project nodes */
      const proj=nodesR.current.map(n=>{
        const w=applyRot(n.u,rx,ry);
        return{n,w,p:project3(w,cx,cy,SR,FOV)};
      });

      /* Edges + traveling particles */
      EDGES.forEach(([sid,tid])=>{
        const sn=proj.find(p=>p.n.id===sid),tn=proj.find(p=>p.n.id===tid);
        if(!sn||!tn)return;
        const avgD=(sn.p.depth+tn.p.depth)/2;
        const front=avgD>=0;
        const rgb=hexRgb(sn.n.color);
        /* Build path once */
        const pts:[number,number][]=[];
        for(let i=0;i<=22;i++){
          const u=slerp3(sn.n.u,tn.n.u,i/22);
          const w=applyRot(u,rx,ry);
          const p=project3(w,cx,cy,SR,FOV);
          pts.push([p.sx,p.sy]);
        }
        /* Main line — coloured by source, clearly visible */
        ctx.strokeStyle=`rgba(${rgb},${front?0.42:0.14})`;
        ctx.lineWidth=front?1.2:0.9;
        ctx.beginPath();
        pts.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
        ctx.stroke();
        /* Soft additive bloom on front edges */
        if(front){
          ctx.save();
          ctx.globalCompositeOperation='lighter';
          ctx.strokeStyle=`rgba(${rgb},0.08)`;
          ctx.lineWidth=2.5;
          ctx.beginPath();
          pts.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
          ctx.stroke();
          ctx.restore();
        }
        particles.current.filter(p=>p.src===sid&&p.tgt===tid).forEach(p=>{
          const u=slerp3(sn.n.u,tn.n.u,p.t);
          const w=applyRot(u,rx,ry);
          const pp=project3(w,cx,cy,SR,FOV);
          const r=3.5*pp.scale;
          const g=ctx.createRadialGradient(pp.sx,pp.sy,0,pp.sx,pp.sy,r*2.2);
          g.addColorStop(0,sn.n.color);g.addColorStop(1,'rgba(0,0,0,0)');
          ctx.beginPath();ctx.arc(pp.sx,pp.sy,r,0,Math.PI*2);ctx.fillStyle=g;ctx.fill();
        });
      });

      /* Depth-sorted draw queue (painter's algorithm) */
      type DI={depth:number;draw:()=>void};
      const dq:DI[]=[];

      /* Atoms */
      atomsR.current.forEach(a=>{
        const nd=nodesR.current.find(x=>x.id===a.nid);if(!nd)return;
        const nw=applyRot(nd.u,rx,ry);
        const b1r=applyRot(a.b1,rx,ry),b2r=applyRot(a.b2,rx,ry);
        const rs=a.orbitR/SR,ca=Math.cos(a.angle),sa=Math.sin(a.angle);
        const av:V3={
          x:nw.x+rs*(b1r.x*ca+b2r.x*sa),
          y:nw.y+rs*(b1r.y*ca+b2r.y*sa),
          z:nw.z+rs*(b1r.z*ca+b2r.z*sa),
        };
        const pp=project3(av,cx,cy,SR,FOV);
        const fade=pp.depth<-.2?.18:1;
        dq.push({depth:pp.depth,draw:()=>{
          ctx.beginPath();ctx.arc(pp.sx,pp.sy,a.size*pp.scale,0,Math.PI*2);
          ctx.fillStyle=`rgba(${hexRgb(nd.color)},${a.opacity*fade})`;ctx.fill();
        }});
      });

      /* Nodes */
      proj.forEach(({n,p:{sx,sy,scale,depth}})=>{
        const isH=hoverR.current===n.id,r=(n.baseR+n.pulse*8)*scale;
        dq.push({depth,draw:()=>{
          /* Glow halo */
          const gl=ctx.createRadialGradient(sx,sy,0,sx,sy,r*3);
          gl.addColorStop(0,`rgba(${hexRgb(n.color)},${.14+n.pulse*.22})`);
          gl.addColorStop(1,'rgba(0,0,0,0)');
          ctx.beginPath();ctx.arc(sx,sy,r*3,0,Math.PI*2);ctx.fillStyle=gl;ctx.fill();
          /* Core */
          const gr=ctx.createRadialGradient(sx-r*.3,sy-r*.3,r*.1,sx,sy,r);
          gr.addColorStop(0,'#fff');gr.addColorStop(.4,n.color);gr.addColorStop(1,`rgba(${hexRgb(n.color)},.5)`);
          ctx.beginPath();ctx.arc(sx,sy,r,0,Math.PI*2);ctx.fillStyle=gr;ctx.fill();
          if(isH){ctx.strokeStyle='rgba(255,255,255,0.9)';ctx.lineWidth=1.5;ctx.stroke();}
          /* Labels */
          const fs=Math.max(9,Math.round(11*scale));
          ctx.font=`bold ${fs}px Inter,sans-serif`;
          ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='top';
          ctx.fillText(n.label,sx,sy+r+3*scale);
          ctx.font=`${Math.max(7,Math.round(8*scale))}px Inter,sans-serif`;
          ctx.fillStyle='rgba(255,255,255,0.42)';
          ctx.fillText(n.count.toLocaleString(),sx,sy+r+(fs+5)*scale);
          ctx.textBaseline='alphabetic';
        }});
      });

      dq.sort((a,b)=>a.depth-b.depth);
      dq.forEach(d=>d.draw());
      ctx.restore();
      raf.current=requestAnimationFrame(frame);
    };

    raf.current=requestAnimationFrame(frame);
    return()=>cancelAnimationFrame(raf.current);
  },[ready]);

  /* Hit test helper */
  const hitNode=useCallback((ex:number,ey:number)=>{
    const canvas=cvs.current;if(!canvas)return null;
    const rect=canvas.getBoundingClientRect();
    const mx=ex-rect.left,my=ey-rect.top;
    const cx=rect.width/2,cy=rect.height/2,SR=Math.min(rect.width,rect.height)*.32,FOV=3.2;
    let best:string|null=null,bd=Infinity;
    nodesR.current.forEach(n=>{
      const w=applyRot(n.u,rot.current.x,rot.current.y);
      const p=project3(w,cx,cy,SR,FOV);
      const dist=Math.hypot(mx-p.sx,my-p.sy);
      if(dist<(n.baseR+8)*p.scale&&dist<bd){bd=dist;best=n.id;}
    });
    return best;
  },[]);

  /* Pointer handlers */
  const onDown=useCallback((e:React.PointerEvent)=>{
    const nid=hitNode(e.clientX,e.clientY);
    drag.current={on:true,lx:e.clientX,ly:e.clientY,nid};
    (e.target as Element).setPointerCapture(e.pointerId);
    setGrabbing(true);
  },[hitNode]);

  const onMove=useCallback((e:React.PointerEvent)=>{
    const d=drag.current;
    const dx=e.clientX-d.lx,dy=e.clientY-d.ly;
    d.lx=e.clientX;d.ly=e.clientY;
    if(d.on){
      const drx=dy*.005,dry=dx*.005;
      if(d.nid){
        /* Drag individual node on sphere surface */
        const n=nodesR.current.find(x=>x.id===d.nid);
        if(n)n.u=norm3(rotY(rotX(n.u,drx),dry));
      }else{
        /* Rotate whole globe — apply immediately AND store as velocity for inertia */
        rot.current.x+=drx;rot.current.y+=dry;
        vel.current.x=vel.current.x*0.6+drx*0.4;
        vel.current.y=vel.current.y*0.6+dry*0.4;
      }
    }
    const h=hitNode(e.clientX,e.clientY);
    hoverR.current=h;
    if(h){
      const n=nodesR.current.find(x=>x.id===h);
      const rect=cvs.current?.getBoundingClientRect();
      if(n&&rect)setTooltip({label:`${n.label} — ${n.sublabel}`,count:n.count,x:e.clientX-rect.left,y:e.clientY-rect.top});
    }else setTooltip(null);
  },[hitNode]);

  const onUp=useCallback(()=>{
    drag.current.on=false;drag.current.nid=null;setGrabbing(false);
  },[]);

  return(
    <div className="relative w-full h-full bg-gray-950 overflow-hidden" style={{minHeight:600}}>
      {/* Header */}
      <div className="absolute top-4 left-6 z-10 pointer-events-none">
        <div className="text-white font-bold text-lg tracking-wide">Knowledge Globe</div>
        <div className="text-gray-500 text-xs mt-0.5">drag globe to rotate · drag nodes to reposition</div>
      </div>

      {/* Live badge */}
      <div className="absolute top-4 right-6 z-10 flex items-center gap-2 pointer-events-none">
        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"/>
        <span className="text-green-400 text-xs font-mono">LIVE{live>0&&` +${live}`}</span>
      </div>

      {/* Canvas */}
      <canvas
        ref={cvs}
        className="w-full h-full block"
        style={{cursor:grabbing?'grabbing':'grab'}}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
      />

      {/* Tooltip */}
      {tooltip&&(
        <div
          className="absolute pointer-events-none z-20 bg-gray-900/90 border border-gray-700 rounded-lg px-3 py-2 text-xs shadow-xl"
          style={{left:tooltip.x,top:tooltip.y-70,transform:'translateX(-50%)'}}>
          <div className="text-white font-semibold">{tooltip.label}</div>
          <div className="text-gray-400 mt-0.5">{tooltip.count.toLocaleString()} records</div>
        </div>
      )}

      {/* Activity feed */}
      {feed.length>0&&(
        <div className="absolute bottom-4 left-4 z-10 space-y-0.5 pointer-events-none">
          {feed.slice(0,5).map(f=>(
            <div key={f.id} className="text-xs font-mono text-gray-400 truncate max-w-xs">
              <span className="text-green-500">{f.time}</span>{' '}{f.label}
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-4 right-4 z-10 grid grid-cols-2 gap-x-4 gap-y-0.5 pointer-events-none">
        {NODE_DEFS.map(n=>(
          <div key={n.id} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:n.color}}/>
            <span className="text-gray-400 text-xs">{n.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
