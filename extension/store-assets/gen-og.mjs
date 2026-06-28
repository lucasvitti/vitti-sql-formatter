/* Generates the 1200x630 social-share (Open Graph) image for identar.lucas.mat.br.
 * Renders an authentic formatted snippet via the real engine, then headless Chrome
 * screenshots the frame at exactly 1200x630 (--force-device-scale-factor=1). */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const SQLFmt = require(path.join(here, '..', 'sqlfmt.js'));

const SAMPLE =
  "select id, sum(amount) total from orders " +
  "where status = 'paid' and region = 'BR'";
const code = SQLFmt.format(SAMPLE, { useTabs: false, filterColumn: 22 });

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const FUNCS = new Set(['sum','count','coalesce','max','min','avg','cast','lower','upper']);
const KEYS  = new Set(['select','from','join','on','and','or','where','group','order','by','having','as','desc','asc','with','distinct']);
function hl(raw) {
  return esc(raw).replace(/('[^']*')|\b([A-Za-z_][A-Za-z0-9_]*)\b|\b(\d+)\b/g, (m, str, word, num) => {
    if (str) return `<span class="st">${str}</span>`;
    if (num) return `<span class="nu">${num}</span>`;
    const lw = word.toLowerCase();
    if (FUNCS.has(lw)) return `<span class="fn">${word}</span>`;
    if (KEYS.has(lw))  return `<span class="kw">${word}</span>`;
    return word;
  });
}

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:1200px;height:630px;overflow:hidden}
  body{font-family:'Segoe UI',system-ui,sans-serif;color:#c9d4e8;
    background:radial-gradient(900px 500px at 12% -20%, #1b2a4a 0, transparent 55%),
               linear-gradient(135deg,#0b1020,#11182e);
    display:flex;align-items:center;gap:48px;padding:64px}
  .left{width:548px;flex:none}
  .brand{display:flex;align-items:center;gap:20px;margin-bottom:26px}
  .brand img{width:78px;height:78px;border-radius:18px;box-shadow:0 10px 30px -8px #000a}
  h1{font-size:50px;font-weight:800;letter-spacing:-1px;line-height:1.05}
  .tag{font-size:27px;color:#aeb9d4;line-height:1.4;margin-bottom:30px}
  .tag b{color:#e6edf3;font-weight:700}
  .pills{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:34px}
  .pill{background:#13203a;border:1px solid #24345a;color:#9fb4dc;font-size:18px;padding:8px 16px;border-radius:999px}
  .url{display:inline-flex;align-items:center;gap:10px;font-size:24px;font-weight:700;color:#38bdf8}
  .url::before{content:'';width:11px;height:11px;border-radius:50%;background:#34d399;box-shadow:0 0 12px #34d399}
  .card{flex:1;background:#0e1526;border:1px solid #1e2944;border-radius:18px;overflow:hidden;
    box-shadow:0 30px 70px -24px #000c;align-self:stretch;margin:18px 0;display:flex;flex-direction:column}
  .bar{height:42px;background:#0a0f1d;border-bottom:1px solid #1e2944;display:flex;align-items:center;gap:9px;padding:0 16px}
  .dot{width:12px;height:12px;border-radius:50%}
  .tt{margin-left:10px;color:#7d8bab;font-size:15px;font-family:ui-monospace,Consolas,monospace}
  pre{padding:24px 24px;font-family:Consolas,'Courier New',monospace;font-size:19px;line-height:1.62;
    white-space:pre;color:#c9d4e8;font-variant-ligatures:none;font-feature-settings:"liga" 0,"calt" 0}
  .kw{color:#7aa2ff}.fn{color:#c792ea}.st{color:#9ece6a}.nu{color:#ff9e64}
</style></head><body>
  <div class="left">
    <div class="brand"><img src="store-logo-300.png"><h1>Vitti SQL<br>Formatter</h1></div>
    <div class="tag">Messy SQL in — a clean <b>“river”</b> layout out.<br>One click, right in your browser.</div>
    <div class="pills"><span class="pill">river layout</span><span class="pill">leading commas</span>
      <span class="pill">where 1=1</span><span class="pill">aligned aliases</span></div>
    <div class="url">identar.lucas.mat.br</div>
  </div>
  <div class="card">
    <div class="bar"><span class="dot" style="background:#ff5f57"></span><span class="dot" style="background:#febc2e"></span>
      <span class="dot" style="background:#28c840"></span><span class="tt">formatted.sql</span></div>
    <pre>${hl(code)}</pre>
  </div>
</body></html>`;

fs.writeFileSync(path.join(here, 'og-frame.html'), html);
console.log('Wrote og-frame.html (formatted snippet:\\n' + code + '\\n)');
