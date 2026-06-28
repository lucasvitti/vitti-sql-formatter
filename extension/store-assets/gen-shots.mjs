/* Generates three 1280x800 store-screenshot HTML frames using the REAL engine
 * output, so the screenshots show authentic Vitti-style formatting.
 * Render to PNG with headless Chrome at --force-device-scale-factor=1. */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const SQLFmt = require(path.join(here, '..', 'sqlfmt.js'));

const SAMPLE =
  "select c.customer_id, c.name, sum(o.amount) total, count(*) as orders " +
  "from customers c join orders o on o.customer_id = c.customer_id " +
  "where o.status = 'paid' and o.created_at >= '2026-01-01' " +
  "group by c.customer_id, c.name having sum(o.amount) > 1000 order by total desc";

// spaces (not tabs) so 1 char === 1ch in the <pre>, making the ruler overlay exact
const base = { useTabs: false };
const fmtDefault = SQLFmt.format(SAMPLE, { ...base });
const fmtRulers  = SQLFmt.format(SAMPLE, { ...base, riverWidth: 12, aliasColumn: 48, joinColumn: 28, filterColumn: 36 });
const fmtUpper   = SQLFmt.format(SAMPLE, { ...base, keywordCase: 'upper' });

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const FUNCS = new Set(['sum','count','coalesce','max','min','avg','row_number','rank','dense_rank','nullif','cast','lower','upper','trim']);
const KEYS  = new Set(['select','from','join','left','right','inner','outer','cross','on','and','or','not','where','group','order','by','having','with','case','when','then','else','end','over','partition','distinct','desc','asc','in','like','is','null','union','all','as']);
function hl(raw) {
  const s = esc(raw);
  const re = /('[^']*')|\b([A-Za-z_][A-Za-z0-9_]*)\b|\b(\d+)\b/g;
  return s.replace(re, (m, str, word, num) => {
    if (str) return `<span class="st">${str}</span>`;
    if (num) return `<span class="nu">${num}</span>`;
    const lw = word.toLowerCase();
    if (FUNCS.has(lw)) return `<span class="fn">${word}</span>`;
    if (KEYS.has(lw))  return `<span class="kw">${word}</span>`;
    return word;
  });
}

const SHELL = (inner) => `<!doctype html><html><head><meta charset="utf-8"><style>
  :root{ --bg0:#0b1020; --bg1:#11182e; --card:#0e1526; --line:#1e2944; --txt:#c9d4e8; --dim:#7d8bab;
         --kw:#7aa2ff; --fn:#c792ea; --st:#9ece6a; --nu:#ff9e64; --accent:#38bdf8; }
  *{ box-sizing:border-box; margin:0; padding:0; }
  html,body{ width:1280px; height:800px; overflow:hidden; }
  body{ font-family:'Segoe UI',system-ui,sans-serif; color:var(--txt);
        background:radial-gradient(1200px 600px at 18% -10%, #1b2a4a 0, transparent 60%),
                   linear-gradient(135deg,var(--bg0),var(--bg1)); }
  .wrap{ width:1280px; height:800px; padding:54px 64px; display:flex; flex-direction:column; }
  .brand{ display:flex; align-items:center; gap:14px; margin-bottom:6px; }
  .logo{ width:46px; height:46px; border-radius:11px; background:linear-gradient(135deg,#38bdf8,#7aa2ff);
         display:flex; align-items:center; justify-content:center; font-weight:800; font-size:24px; color:#06101f; }
  h1{ font-size:34px; font-weight:800; letter-spacing:-.5px; }
  .sub{ color:var(--dim); font-size:19px; margin:8px 0 26px; }
  .card{ background:var(--card); border:1px solid var(--line); border-radius:16px; overflow:hidden;
         box-shadow:0 24px 60px -20px #000a; }
  .bar{ height:38px; background:#0a0f1d; border-bottom:1px solid var(--line); display:flex; align-items:center;
        gap:8px; padding:0 14px; }
  .dot{ width:11px; height:11px; border-radius:50%; }
  .tt{ margin-left:10px; color:var(--dim); font-size:13px; font-family:ui-monospace,Consolas,monospace; }
  pre{ font-family:Consolas,'Courier New',ui-monospace,monospace; font-size:15px; line-height:1.62;
       white-space:pre; color:var(--txt); font-variant-ligatures:none; font-feature-settings:"liga" 0,"calt" 0; }
  .kw{ color:var(--kw); } .fn{ color:var(--fn); } .st{ color:var(--st); } .nu{ color:var(--nu); }
  .cols{ display:grid; grid-template-columns:1fr 1fr; gap:22px; }
  .lbl{ font-size:13px; text-transform:uppercase; letter-spacing:1.5px; color:var(--dim); margin:0 4px 9px; font-weight:700; }
  .pad{ padding:20px 22px; }
  .messy{ color:#8aa; }
  .foot{ margin-top:auto; color:var(--dim); font-size:15px; display:flex; align-items:center; gap:10px; }
  .pill{ background:#13203a; border:1px solid var(--line); color:#9fb4dc; padding:5px 12px; border-radius:999px; font-size:13px; }
</style></head><body><div class="wrap">${inner}</div></body></html>`;

const dots = `<span class="dot" style="background:#ff5f57"></span><span class="dot" style="background:#febc2e"></span><span class="dot" style="background:#28c840"></span>`;

/* ---- Frame 1: before -> after ---- */
const f1 = SHELL(`
  <div class="brand"><div class="logo">⚡</div><h1>Vitti SQL Formatter</h1></div>
  <div class="sub">Paste messy SQL — get a clean, scannable “river” layout in one click.</div>
  <div class="cols">
    <div>
      <div class="lbl">Before</div>
      <div class="card"><div class="bar">${dots}<span class="tt">pasted.sql</span></div>
        <div class="pad"><pre class="messy">${esc(SAMPLE.replace(/ (from|where|group by|having|order by|join) /g, '\n$1 '))}</pre></div></div>
    </div>
    <div>
      <div class="lbl">After</div>
      <div class="card"><div class="bar">${dots}<span class="tt">formatted.sql</span></div>
        <div class="pad"><pre>${hl(fmtDefault)}</pre></div></div>
    </div>
  </div>
  <div class="foot"><span class="pill">lowercase keywords</span><span class="pill">leading commas</span>
    <span class="pill">where 1=1</span><span class="pill">aligned aliases</span></div>`);

/* ---- Frame 2: draggable alignment rulers (web app) ---- */
const lines2 = fmtRulers.split('\n').length;
const PADL = 22; // px, matches .pad left padding
function ruler(ch, color, name, topPx) {
  return `<div style="position:absolute; top:0; bottom:0; left:calc(${PADL}px + ${ch}ch); width:2px;
      background:${color}; opacity:.55;">
      <div style="position:absolute; top:${topPx}px; left:-7px; width:16px; height:16px; border-radius:4px;
        background:${color}; box-shadow:0 2px 6px #0008; cursor:grab;"></div>
      <div style="position:absolute; top:${topPx - 22}px; left:10px; white-space:nowrap; font-size:12px;
        font-family:'Segoe UI',sans-serif; color:${color}; font-weight:700;">${name}</div></div>`;
}
const f2 = SHELL(`
  <div class="brand"><div class="logo">⚡</div><h1>Draggable alignment rulers</h1></div>
  <div class="sub">On the free web app, drag four colour-coded rulers to set every alignment column live.</div>
  <div class="card"><div class="bar">${dots}<span class="tt">identar.lucas.mat.br</span></div>
    <div class="pad" style="position:relative; overflow:hidden;">
      <pre>${hl(fmtRulers)}</pre>
      ${ruler(12, '#38bdf8', 'fields', 30)}
      ${ruler(28, '#fb923c', 'joins', 152)}
      ${ruler(36, '#a78bfa', 'filter', 232)}
      ${ruler(48, '#34d399', 'labels', 30)}
    </div></div>
  <div class="foot"><span class="pill">fields</span><span class="pill">labels</span>
    <span class="pill">joins</span><span class="pill">filter</span>
    <span style="margin-left:auto">identar.lucas.mat.br</span></div>`);

/* ---- Frame 3: configurable ---- */
const f3 = SHELL(`
  <div class="brand"><div class="logo">⚡</div><h1>Configurable to your taste</h1></div>
  <div class="sub">Column spacing, keyword case, tabs or spaces — set once in the popup’s Config tab.</div>
  <div class="cols">
    <div>
      <div class="lbl">lowercase keywords</div>
      <div class="card"><div class="bar">${dots}<span class="tt">keywordCase: lower</span></div>
        <div class="pad"><pre>${hl(fmtDefault)}</pre></div></div>
    </div>
    <div>
      <div class="lbl">UPPERCASE keywords</div>
      <div class="card"><div class="bar">${dots}<span class="tt">keywordCase: upper</span></div>
        <div class="pad"><pre>${hl(fmtUpper)}</pre></div></div>
    </div>
  </div>
  <div class="foot"><span class="pill">river width</span><span class="pill">alias / join / filter columns</span>
    <span class="pill">tabs or spaces</span><span class="pill">keyword case</span></div>`);

fs.writeFileSync(path.join(here, 'frame1.html'), f1);
fs.writeFileSync(path.join(here, 'frame2.html'), f2);
fs.writeFileSync(path.join(here, 'frame3.html'), f3);
console.log('Wrote frame1.html, frame2.html, frame3.html');
