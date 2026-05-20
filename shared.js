/* ═══════════════════════════════════════════
   AVA — Shared JavaScript
═══════════════════════════════════════════ */
'use strict';

/* ── LANGUAGE ─────────────────────────────── */
const LANGS = ['fr','ar','en'];
function setLang(lang) {
  if (!LANGS.includes(lang)) return;
  const html = document.documentElement, body = document.body;
  html.lang = lang;
  html.dir  = lang === 'ar' ? 'rtl' : 'ltr';
  LANGS.forEach(l => body.classList.remove('lang-active-'+l));
  body.classList.add('lang-active-'+lang);
  document.querySelectorAll('.lang-btn').forEach(b => {
    const a = b.dataset.lang === lang;
    b.classList.toggle('active', a);
    b.setAttribute('aria-pressed', String(a));
  });
  try { localStorage.setItem('ava-lang', lang); } catch(e){}
}
function initLang() {
  let s = 'fr';
  try { s = localStorage.getItem('ava-lang') || 'fr'; } catch(e){}
  setLang(LANGS.includes(s) ? s : 'fr');
}
document.querySelectorAll('.lang-btn').forEach(b => b.addEventListener('click', () => setLang(b.dataset.lang)));
initLang();

/* ── NAVBAR ───────────────────────────────── */
(function() {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;
  window.addEventListener('scroll', () => navbar.classList.toggle('scrolled', scrollY > 20), {passive:true});

  // Active nav link
  const page = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(a => {
    const href = a.getAttribute('href');
    if (href && href.includes(page)) a.classList.add('active');
  });

  // Hamburger
  const hbg = document.getElementById('hamburger');
  const mob = document.getElementById('nav-mobile');
  if (hbg && mob) {
    hbg.addEventListener('click', () => {
      const o = mob.classList.toggle('open');
      hbg.classList.toggle('open', o);
      hbg.setAttribute('aria-expanded', String(o));
    });
    mob.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      mob.classList.remove('open'); hbg.classList.remove('open'); hbg.setAttribute('aria-expanded','false');
    }));
    document.addEventListener('click', e => {
      if (!navbar.contains(e.target)) { mob.classList.remove('open'); hbg.classList.remove('open'); hbg.setAttribute('aria-expanded','false'); }
    });
  }
})();

/* ── SCROLL REVEAL ────────────────────────── */
(function() {
  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('in'));
    return;
  }
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if(e.isIntersecting){ e.target.classList.add('in'); obs.unobserve(e.target); } });
  }, { threshold: .1, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
})();

/* ── SMOOTH SCROLL ────────────────────────── */
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', function(e) {
    const t = document.querySelector(this.getAttribute('href'));
    if (t) {
      e.preventDefault();
      const offset = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 68;
      window.scrollTo({ top: t.getBoundingClientRect().top + scrollY - offset, behavior: 'smooth' });
    }
  });
});

/* ── COUNTER ANIMATION ────────────────────── */
let countersRun = false;
function runCounters() {
  document.querySelectorAll('.counter[data-target]').forEach(el => {
    const target = parseInt(el.dataset.target, 10);
    let n = 0; const dur = 1400, step = 16, inc = target / (dur/step);
    const timer = setInterval(() => { n+=inc; if(n>=target){n=target; clearInterval(timer);} el.textContent=Math.round(n); }, step);
  });
}
const trustEl = document.getElementById('trust');
if (trustEl && 'IntersectionObserver' in window) {
  new IntersectionObserver(entries => {
    if (entries[0].isIntersecting && !countersRun) { countersRun = true; runCounters(); }
  }, { threshold: .4 }).observe(trustEl);
}

/* ── WORKFLOW CANVAS ──────────────────────── */
function initWorkflowCanvas(canvasId, nodesDefs, edgeDefs) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, nodes, edges, packets;

  function resize() {
    W = canvas.width  = canvas.offsetWidth  || canvas.parentElement.offsetWidth;
    H = canvas.height = canvas.offsetHeight || canvas.parentElement.offsetHeight;
    if (W < 10 || H < 10) return;
    build();
  }

  function build() {
    nodes = nodesDefs.map(d => ({
      ...d, x: d.rx * W, y: d.ry * H, pulse: Math.random() * Math.PI * 2
    }));
    const nm = {};
    nodes.forEach(n => nm[n.id] = n);
    edges = edgeDefs.map(([a,b]) => {
      const na = nm[a], nb = nm[b];
      const cy = (na.y + nb.y)/2 - 20 + (Math.random()-0.5)*24;
      return { from:na, to:nb, cx:(na.x+nb.x)/2, cy };
    });
    packets = [];
    edges.forEach(e => {
      const count = 1 + Math.floor(Math.random()*2);
      for (let i=0;i<count;i++) packets.push({ edge:e, t:Math.random(), speed:0.0016+Math.random()*0.0022 });
    });
  }

  function bezierPt(x0,y0,cx,cy,x1,y1,t) {
    const m=1-t;
    return { x:m*m*x0+2*m*t*cx+t*t*x1, y:m*m*y0+2*m*t*cy+t*t*y1 };
  }

  let time=0;
  function draw() {
    if (!W || !H) { requestAnimationFrame(draw); return; }
    ctx.clearRect(0,0,W,H);
    time += 0.01;

    // dot grid
    ctx.fillStyle='rgba(0,212,255,0.055)';
    const gs=50;
    for (let gx=gs/2;gx<W;gx+=gs) for (let gy=gs/2;gy<H;gy+=gs) { ctx.beginPath(); ctx.arc(gx,gy,.85,0,Math.PI*2); ctx.fill(); }

    // edges
    edges.forEach(e => {
      ctx.beginPath();
      ctx.moveTo(e.from.x, e.from.y);
      ctx.quadraticCurveTo(e.cx, e.cy, e.to.x, e.to.y);
      ctx.strokeStyle='rgba(0,212,255,0.07)'; ctx.lineWidth=1; ctx.setLineDash([]); ctx.stroke();
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(e.from.x, e.from.y);
      ctx.quadraticCurveTo(e.cx, e.cy, e.to.x, e.to.y);
      ctx.strokeStyle='rgba(0,212,255,0.16)'; ctx.lineWidth=1;
      ctx.setLineDash([5,20]); ctx.lineDashOffset=-time*20; ctx.stroke();
      ctx.restore();
    });

    // packets
    packets.forEach(p => {
      p.t += p.speed; if(p.t>1) p.t=0;
      const e=p.edge, pos=bezierPt(e.from.x,e.from.y,e.cx,e.cy,e.to.x,e.to.y,p.t);
      const g=ctx.createRadialGradient(pos.x,pos.y,0,pos.x,pos.y,9);
      g.addColorStop(0,'rgba(0,212,255,.85)'); g.addColorStop(.45,'rgba(0,212,255,.25)'); g.addColorStop(1,'rgba(0,212,255,0)');
      ctx.beginPath(); ctx.arc(pos.x,pos.y,9,0,Math.PI*2); ctx.fillStyle=g; ctx.fill();
      ctx.beginPath(); ctx.arc(pos.x,pos.y,2.2,0,Math.PI*2); ctx.fillStyle='#00D4FF'; ctx.fill();
    });

    // nodes
    nodes.forEach(n => {
      const pulse=0.5+0.5*Math.sin(time*1.1+n.pulse), R=18;
      const colorMap = { '#00D4FF':'rgba(0,212,255,', '#3B82F6':'rgba(59,130,246,', '#22D3A0':'rgba(34,211,160,' };
      const base = colorMap[n.color] || 'rgba(0,212,255,';
      const g=ctx.createRadialGradient(n.x,n.y,R*.4,n.x,n.y,R*2.4);
      g.addColorStop(0,base+(0.16*pulse)+')'); g.addColorStop(1,'rgba(0,0,0,0)');
      ctx.beginPath(); ctx.arc(n.x,n.y,R*2.4,0,Math.PI*2); ctx.fillStyle=g; ctx.fill();
      ctx.beginPath(); ctx.arc(n.x,n.y,R,0,Math.PI*2);
      ctx.fillStyle='rgba(8,14,26,.92)'; ctx.fill();
      ctx.strokeStyle=n.color; ctx.lineWidth=1.5; ctx.globalAlpha=0.45+0.55*pulse; ctx.stroke(); ctx.globalAlpha=1;
      ctx.font=`bold 8px 'Lexend',sans-serif`; ctx.fillStyle=n.color;
      ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.globalAlpha=0.65+0.35*pulse;
      ctx.fillText(n.label,n.x,n.y); ctx.globalAlpha=1;
    });

    requestAnimationFrame(draw);
  }

  new ResizeObserver(resize).observe(canvas.parentElement || canvas);
  resize();
  draw();
}

// Default workflow graph (used by hero + cta)
const DEFAULT_NODES = [
  {id:'input',  label:'INPUT',  rx:.06, ry:.22, color:'#3B82F6'},
  {id:'input2', label:'EMAIL',  rx:.06, ry:.62, color:'#3B82F6'},
  {id:'ocr',    label:'OCR',   rx:.24, ry:.38, color:'#00D4FF'},
  {id:'ai',     label:'AI',    rx:.44, ry:.25, color:'#22D3A0'},
  {id:'rules',  label:'RULES', rx:.44, ry:.60, color:'#00D4FF'},
  {id:'valid',  label:'CHECK', rx:.62, ry:.42, color:'#22D3A0'},
  {id:'erp',    label:'ERP',   rx:.80, ry:.28, color:'#00D4FF'},
  {id:'report', label:'TAX',   rx:.80, ry:.58, color:'#3B82F6'},
  {id:'dash',   label:'KPI',   rx:.93, ry:.43, color:'#22D3A0'},
];
const DEFAULT_EDGES = [
  ['input','ocr'],['input2','ocr'],
  ['ocr','ai'],['ocr','rules'],
  ['ai','valid'],['rules','valid'],
  ['valid','erp'],['valid','report'],
  ['erp','dash'],['report','dash'],
];

document.querySelectorAll('[data-wf-canvas]').forEach(canvas => {
  initWorkflowCanvas(canvas.id, DEFAULT_NODES, DEFAULT_EDGES);
});
