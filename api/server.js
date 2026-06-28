/*
 * Vitti SQL Formatter — HTTP API.
 * Zero dependencies; wraps ./sqlfmt.js. Listens on 127.0.0.1:PORT (nginx proxies).
 *
 *   GET  /                      -> service info + usage
 *   GET  /health               -> {ok:true}
 *   GET  /format?sql=...&opt=.. -> {formatted}      (or &format=text for raw)
 *   POST /format               -> body: JSON {sql, options}  OR  raw SQL text
 *                                 -> {formatted}   (or text/plain if Accept: text/plain)
 *
 * Options (query params or JSON .options): keywordCase, functionCase (lower|upper|preserve),
 * useTabs, where11, bannerComments, blankBetweenClauses, alignAliases (bool),
 * tabWidth, riverWidth, aliasColumn, bannerWidth (int).
 */
'use strict';
const http = require('http');
const SQLFmt = require('./sqlfmt.js');

const PORT = parseInt(process.env.PORT || '8787', 10);
const HOST = process.env.HOST || '127.0.0.1';
const MAX_BODY = 2 * 1024 * 1024; // 2 MB
const VERSION = '1.0.0';

const BOOL_OPTS = ['useTabs', 'where11', 'bannerComments', 'blankBetweenClauses', 'alignAliases', 'caseMultiline', 'overMultiline'];
const NUM_OPTS = ['tabWidth', 'riverWidth', 'aliasColumn', 'joinColumn', 'filterColumn', 'bannerWidth'];
const STR_OPTS = ['keywordCase', 'functionCase'];

function optsFromQuery(params) {
  const o = {};
  STR_OPTS.forEach(k => { if (params.has(k)) o[k] = params.get(k); });
  BOOL_OPTS.forEach(k => { if (params.has(k)) o[k] = /^(1|true|yes|on)$/i.test(params.get(k)); });
  NUM_OPTS.forEach(k => { if (params.has(k)) { const n = parseInt(params.get(k), 10); if (!isNaN(n)) o[k] = n; } });
  return o;
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
}
function sendJSON(res, code, obj) { cors(res); res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); }
function sendText(res, code, txt) { cors(res); res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(txt); }

const USAGE = {
  service: 'vitti-sqlfmt', version: VERSION,
  endpoints: {
    'GET /health': 'liveness probe',
    'GET /format?sql=...': 'format SQL from query string (add &format=text for raw output)',
    'POST /format': 'body = JSON {sql, options} or raw SQL text; returns {formatted} (or text/plain via Accept)'
  },
  options: { string: STR_OPTS, bool: BOOL_OPTS, int: NUM_OPTS }
};

function doFormat(res, sql, options, wantText) {
  try {
    const formatted = SQLFmt.format(String(sql == null ? '' : sql), options || {});
    if (wantText) return sendText(res, 200, formatted);
    return sendJSON(res, 200, { formatted });
  } catch (e) {
    return sendJSON(res, 400, { error: 'format_failed', message: String(e && e.message || e) });
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); return res.end(); }
  if (req.method === 'GET' && (path === '/' )) return sendJSON(res, 200, USAGE);
  if (req.method === 'GET' && path === '/health') return sendJSON(res, 200, { ok: true, version: VERSION });

  if (path === '/format') {
    if (req.method === 'GET') {
      const sql = url.searchParams.get('sql') || '';
      const wantText = (url.searchParams.get('format') || '').toLowerCase() === 'text';
      return doFormat(res, sql, optsFromQuery(url.searchParams), wantText);
    }
    if (req.method === 'POST') {
      let body = '', size = 0, aborted = false;
      req.on('data', c => { size += c.length; if (size > MAX_BODY) { aborted = true; sendJSON(res, 413, { error: 'payload_too_large' }); req.destroy(); return; } body += c; });
      req.on('end', () => {
        if (aborted) return;
        const ct = (req.headers['content-type'] || '').toLowerCase();
        const wantText = (req.headers['accept'] || '').includes('text/plain');
        let sql = '', options = {};
        if (ct.includes('application/json')) {
          try { const j = JSON.parse(body || '{}'); sql = j.sql || ''; options = j.options || {}; }
          catch (e) { return sendJSON(res, 400, { error: 'bad_json', message: String(e.message) }); }
        } else {
          sql = body; options = optsFromQuery(url.searchParams); // allow ?opts on POST raw body
        }
        return doFormat(res, sql, options, wantText);
      });
      return;
    }
    return sendJSON(res, 405, { error: 'method_not_allowed' });
  }
  return sendJSON(res, 404, { error: 'not_found' });
});

server.listen(PORT, HOST, () => console.log(`vitti-sqlfmt api listening on http://${HOST}:${PORT}`));
