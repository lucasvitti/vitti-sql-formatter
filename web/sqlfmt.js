/*
 * sqlfmt.js — the "Vitti style" SQL formatter.
 *
 * Reformats query DML (select / insert..select / update..from / delete, CTEs,
 * case, window functions, subqueries) into the river/leading-comma/where-1=1
 * style documented in RULES.md. Procedural scaffolding (declare/exec/if/
 * begin..end/use/go/create|alter ...) is passed through untouched.
 *
 * Works in the browser (window.SQLFmt), as a Node module (module.exports) and
 * inside a browser extension. No dependencies.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SQLFmt = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* options                                                            */
  /* ------------------------------------------------------------------ */
  var DEFAULTS = {
    tabWidth: 4,         // visual width of one tab (column math)
    riverWidth: 12,      // "fields" — operand column = indent + this (must be multiple of tabWidth)
    aliasColumn: 0,      // "labels" — fixed column for select-list aliases (0 = auto-fit to content)
    joinColumn: 0,       // "joins"  — align comparison operator in JOIN on/and predicates (0 = off)
    filterColumn: 0,     // "filter" — align comparison operator in WHERE/HAVING predicates (0 = off)
    useTabs: true,       // emit tabs (true) or spaces (false) for indent + alignment
    keywordCase: 'lower',// 'lower' | 'upper' | 'preserve'
    functionCase: 'lower',
    where11: true,       // open every WHERE with 1=1
    bannerComments: true,// render leading comments as star-banner blocks
    bannerWidth: 69,     // width of the star border
    blankBetweenClauses: true,
    alignAliases: true,
    caseMultiline: true, // explode multi-branch CASE
    overMultiline: true  // explode long OVER(...) windows
  };

  /* ------------------------------------------------------------------ */
  /* keyword / function vocabularies                                    */
  /* ------------------------------------------------------------------ */
  var KW = wordset(
    'select distinct top from where group by having order union all on and or not ' +
    'as inner left right full outer cross join apply natural using insert into values ' +
    'update set delete merge with recursive case when then else end over partition ' +
    'rows range between unbounded preceding following current row asc desc nulls first ' +
    'last is null in like ilike rlike between exists any some qualify limit offset fetch ' +
    'next only window cube rollup grouping sets lateral pivot unpivot for return ' +
    'truncate table by create replace temporary temp view external database schema ' +
    'drop overwrite if exists'
  );
  // clause keywords that own a "river" line (longest = "insert into" = 11)
  var CLAUSE = wordset(
    'select from where group having order set update values on and or union'
  );
  var JOINWORDS = wordset('join inner left right full outer cross natural apply');
  var FUNCS = wordset(
    'count sum avg min max abs round floor ceil ceiling coalesce isnull nullif cast ' +
    'convert try_cast row_number rank dense_rank ntile lag lead first_value last_value ' +
    'getdate sysdatetime current_timestamp current_date dateadd datediff datepart ' +
    'year month day datename eomonth len length left right substring substr replace ' +
    'concat concat_ws upper lower trim ltrim rtrim format cast stuff charindex patindex ' +
    'iif choose nvl to_date to_char date_format date_trunc to_timestamp split explode ' +
    'collect_list collect_set array map struct size element_at lower upper'
  );

  function wordset(s) { var o = {}; s.split(/\s+/).forEach(function (w) { if (w) o[w] = 1; }); return o; }

  /* ------------------------------------------------------------------ */
  /* tokenizer                                                          */
  /* ------------------------------------------------------------------ */
  function tokenize(sql) {
    var T = [], i = 0, n = sql.length;
    var isWS = function (c) { return c === ' ' || c === '\t' || c === '\r' || c === '\n'; };
    var wordStart = function (c) { return /[A-Za-z_@#$]/.test(c); };
    var wordChar = function (c) { return /[A-Za-z0-9_@#$]/.test(c); };
    while (i < n) {
      var c = sql[i];
      if (isWS(c)) { var j = i + 1; while (j < n && isWS(sql[j])) j++; T.push({ t: 'ws', v: sql.slice(i, j) }); i = j; continue; }
      if (c === '-' && sql[i + 1] === '-') { var j2 = i + 2; while (j2 < n && sql[j2] !== '\n') j2++; T.push({ t: 'lc', v: sql.slice(i, j2) }); i = j2; continue; }
      if (c === '/' && sql[i + 1] === '*') { var j3 = i + 2; while (j3 < n && !(sql[j3] === '*' && sql[j3 + 1] === '/')) j3++; j3 = Math.min(n, j3 + 2); T.push({ t: 'bc', v: sql.slice(i, j3) }); i = j3; continue; }
      if (c === "'") { var j4 = i + 1; while (j4 < n) { if (sql[j4] === "'") { if (sql[j4 + 1] === "'") { j4 += 2; continue; } j4++; break; } j4++; } T.push({ t: 'str', v: sql.slice(i, j4) }); i = j4; continue; }
      if (c === '"') { var j5 = i + 1; while (j5 < n) { if (sql[j5] === '"') { if (sql[j5 + 1] === '"') { j5 += 2; continue; } j5++; break; } j5++; } T.push({ t: 'id', v: sql.slice(i, j5) }); i = j5; continue; }
      if (c === '`') { var j6 = i + 1; while (j6 < n && sql[j6] !== '`') j6++; j6 = Math.min(n, j6 + 1); T.push({ t: 'id', v: sql.slice(i, j6) }); i = j6; continue; }
      if (c === '[') { var j7 = i + 1; while (j7 < n && sql[j7] !== ']') j7++; j7 = Math.min(n, j7 + 1); T.push({ t: 'id', v: sql.slice(i, j7) }); i = j7; continue; }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(sql[i + 1]))) {
        var j8 = i + 1; while (j8 < n && /[0-9._a-fA-FxX]/.test(sql[j8])) j8++;
        if (sql[j8] === 'e' || sql[j8] === 'E') { j8++; if (sql[j8] === '+' || sql[j8] === '-') j8++; while (j8 < n && /[0-9]/.test(sql[j8])) j8++; }
        T.push({ t: 'num', v: sql.slice(i, j8) }); i = j8; continue;
      }
      if (wordStart(c)) { var j9 = i + 1; while (j9 < n && wordChar(sql[j9])) j9++; T.push({ t: 'word', v: sql.slice(i, j9) }); i = j9; continue; }
      // multi-char operators
      var three = sql.substr(i, 3), two = sql.substr(i, 2);
      if (three === '<=>') { T.push({ t: 'op', v: three }); i += 3; continue; }
      if (['<>', '!=', '>=', '<=', '||', '::', '->', '+=', '-=', '*=', '/='].indexOf(two) >= 0) { T.push({ t: 'op', v: two }); i += 2; continue; }
      if ('=<>+-*/%'.indexOf(c) >= 0) { T.push({ t: 'op', v: c }); i++; continue; }
      T.push({ t: 'punct', v: c }); i++;
    }
    return T;
  }

  // strip whitespace tokens (we re-emit our own); keep comments
  function compact(T) { return T.filter(function (t) { return t.t !== 'ws'; }); }

  /* ------------------------------------------------------------------ */
  /* small helpers                                                      */
  /* ------------------------------------------------------------------ */
  function lc(s) { return s.toLowerCase(); }
  function isWord(tok, w) { return tok && tok.t === 'word' && lc(tok.v) === w; }
  function kwv(tok) { return tok && tok.t === 'word' ? lc(tok.v) : null; }

  function cased(word, opt, isFunc) {
    var mode = isFunc ? opt.functionCase : opt.keywordCase;
    if (mode === 'upper') return word.toUpperCase();
    if (mode === 'lower') return word.toLowerCase();
    return word;
  }

  // canonical case applied to a single word token if it is keyword/function
  function applyCase(tok, opt) {
    if (tok.t !== 'word') return tok.v;
    var l = lc(tok.v);
    if (KW[l]) return cased(tok.v, opt, false);
    if (FUNCS[l]) return cased(tok.v, opt, true);
    return tok.v; // identifier — preserve
  }

  function nextTab(col, w) { return Math.floor(col / w) * w + w; }

  // build padding (tabs or spaces) advancing from `fromCol` to at least `toCol`,
  // guaranteeing >= 1 unit of gap.
  function pad(fromCol, toCol, opt) {
    var w = opt.tabWidth, col = fromCol, s = '';
    if (col >= toCol) {
      if (opt.useTabs) { s += '\t'; col = nextTab(col, w); } else { s += ' '; col++; }
    }
    while (col < toCol) {
      if (opt.useTabs) { s += '\t'; col = nextTab(col, w); }
      else { s += ' '; col++; }
    }
    return s;
  }

  function indentStr(level, opt) {
    if (opt.useTabs) return new Array(level + 1).join('\t');
    return new Array(level * opt.tabWidth + 1).join(' ');
  }

  // visual width of a rendered string starting at column `start`
  function vlen(str, start, w) {
    var col = start;
    for (var k = 0; k < str.length; k++) {
      if (str[k] === '\t') col = nextTab(col, w); else col++;
    }
    return col - start;
  }

  /* ------------------------------------------------------------------ */
  /* inline renderer — tokens -> clean single line                      */
  /* ------------------------------------------------------------------ */
  function renderInline(toks, opt) {
    var out = '';
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i], prev = toks[i - 1], next = toks[i + 1];
      var v = t.t === 'word' ? applyCase(t, opt) : t.v;
      if (t.t === 'lc') { out += (out && !/\s$/.test(out) ? ' ' : '') + t.v; continue; }
      if (t.t === 'bc') { out += (out && !/\s$/.test(out) ? ' ' : '') + t.v + ' '; continue; }

      var noSpaceBefore = false;
      if (out === '') noSpaceBefore = true;
      else if (t.t === 'punct' && (t.v === ',' || t.v === ')' || t.v === '.' || t.v === ';')) noSpaceBefore = true;
      else if (t.t === 'op' && t.v === '::') noSpaceBefore = true;
      else if (prev && prev.t === 'op' && prev.v === '::') noSpaceBefore = true;
      else if (prev && prev.t === 'punct' && (prev.v === '.' || prev.v === '(')) noSpaceBefore = true;
      else if (prev && prev.t === 'punct' && prev.v === ',') noSpaceBefore = true; // no space after comma inside expressions: isnull(x,0)
      else if (t.t === 'punct' && t.v === '(') {
        // function call paren attaches to identifier/func; keyword gets a space
        var p = prev;
        if (p && (p.t === 'word')) noSpaceBefore = KW[lc(p.v)] ? false : true;
        else if (p && (p.t === 'id' || (p.t === 'punct' && p.v === ')'))) noSpaceBefore = true;
        else noSpaceBefore = false;
      }
      else if (isUnarySign(t, prev)) noSpaceBefore = false; // space before the sign itself ok
      else if (prev && isUnarySign(prev, toks[i - 2])) noSpaceBefore = true; // no space after unary sign
      else if (t.t === 'op' && t.v === '*' && isStar(prev)) noSpaceBefore = true; // count(*) , a.*

      if (!noSpaceBefore) out += ' ';
      out += v;
    }
    return out.replace(/\s+;/g, ';').trimEnd();
  }

  function isStar(prev) {
    if (!prev) return true;
    if (prev.t === 'punct' && (prev.v === '(' || prev.v === ',')) return true;
    if (prev.t === 'word' && lc(prev.v) === 'select') return true;
    if (prev.t === 'punct' && prev.v === '.') return true;
    return false;
  }
  // a +/- is unary if at expression start or right after ( , or another operator/keyword
  function isUnarySign(t, prev) {
    if (!(t.t === 'op' && (t.v === '+' || t.v === '-'))) return false;
    if (!prev) return true;
    if (prev.t === 'op') return true;
    if (prev.t === 'punct' && (prev.v === '(' || prev.v === ',')) return true;
    if (prev.t === 'word' && KW[lc(prev.v)]) return true;
    return false;
  }

  /* ------------------------------------------------------------------ */
  /* split helpers (respecting paren depth + case..end depth)           */
  /* ------------------------------------------------------------------ */
  function splitTop(toks, sepTest) {
    var groups = [], cur = [], depth = 0, caseDepth = 0;
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (t.t === 'punct' && t.v === '(') depth++;
      else if (t.t === 'punct' && t.v === ')') depth--;
      else if (isWord(t, 'case')) caseDepth++;
      else if (isWord(t, 'end') && caseDepth > 0) caseDepth--;
      if (depth === 0 && caseDepth === 0 && sepTest(t, i, toks)) {
        groups.push(cur); cur = []; continue; // separator consumed
      }
      cur.push(t);
    }
    groups.push(cur);
    return groups;
  }

  // split a comma list at top level, keeping commas out
  function splitCommas(toks) { return splitTop(toks, function (t) { return t.t === 'punct' && t.v === ','; }); }

  // split predicates on top-level and/or, returning [{op, toks}]
  function splitAndOr(toks) {
    var parts = [], cur = [], op = null, depth = 0, caseDepth = 0;
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (t.t === 'punct' && t.v === '(') depth++;
      else if (t.t === 'punct' && t.v === ')') depth--;
      else if (isWord(t, 'case')) caseDepth++;
      else if (isWord(t, 'end') && caseDepth > 0) caseDepth--;
      if (depth === 0 && caseDepth === 0 && (isWord(t, 'and') || isWord(t, 'or'))) {
        parts.push({ op: op, toks: cur }); cur = []; op = lc(t.v); continue;
      }
      cur.push(t);
    }
    parts.push({ op: op, toks: cur });
    return parts;
  }

  /* ------------------------------------------------------------------ */
  /* alias detection for a select-list item                             */
  /* ------------------------------------------------------------------ */
  function splitAlias(toks) {
    if (!toks.length) return { expr: toks, alias: '' };
    var last = toks[toks.length - 1];
    var canAlias = last.t === 'id' || (last.t === 'word' && !KW[lc(last.v)] && !FUNCS[lc(last.v)]);
    if (!canAlias) return { expr: toks, alias: '' };
    var before = toks[toks.length - 2];
    if (!before) return { expr: toks, alias: '' };
    // explicit AS
    if (isWord(before, 'as')) return { expr: toks.slice(0, toks.length - 2), alias: last.v };
    // implicit: previous token must end an expression
    var ends = before.t === 'id' || before.t === 'num' || before.t === 'str' ||
      (before.t === 'punct' && before.v === ')') ||
      (before.t === 'word' && (lc(before.v) === 'end' || (!KW[lc(before.v)])));
    if (ends) return { expr: toks.slice(0, toks.length - 1), alias: last.v };
    return { expr: toks, alias: '' };
  }

  function hasTopCase(toks) {
    var depth = 0;
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (t.t === 'punct' && t.v === '(') depth++;
      else if (t.t === 'punct' && t.v === ')') depth--;
      else if (isWord(t, 'case')) return true;
    }
    return false;
  }
  function countWhen(toks) { var c = 0; toks.forEach(function (t) { if (isWord(t, 'when')) c++; }); return c; }

  /* ------------------------------------------------------------------ */
  /* CASE renderer (multiline)                                          */
  /* ------------------------------------------------------------------ */
  // renders a token slice that *is* a case expression (optionally wrapped in
  // one layer of parens) as multiline, starting at column `col`.
  function renderCaseMultiline(toks, col, opt) {
    var wrapOpen = '', wrapClose = '';
    var body = toks;
    if (body[0] && body[0].t === 'punct' && body[0].v === '(' &&
      body[body.length - 1] && body[body.length - 1].t === 'punct' && body[body.length - 1].v === ')') {
      wrapOpen = '('; wrapClose = ')'; body = body.slice(1, body.length - 1);
    }
    // body = case when..then.. [when..] [else..] end
    var whenParts = [], elsePart = null, head = '';
    var i = 0;
    if (isWord(body[0], 'case')) i = 1;
    // optional simple-case operand: case <expr> when..
    var simple = [];
    while (i < body.length && !isWord(body[i], 'when') && !isWord(body[i], 'end')) { simple.push(body[i]); i++; }
    var branches = [];
    while (i < body.length && isWord(body[i], 'when')) {
      var seg = [body[i]]; i++;
      while (i < body.length && !isWord(body[i], 'when') && !isWord(body[i], 'else') && !isWord(body[i], 'end')) { seg.push(body[i]); i++; }
      branches.push(seg);
    }
    if (i < body.length && isWord(body[i], 'else')) {
      var eseg = [body[i]]; i++;
      while (i < body.length && !isWord(body[i], 'end')) { eseg.push(body[i]); i++; }
      elsePart = eseg;
    }
    var inner = colToIndent(col, opt) + 1;
    var innerPad = indentStr(inner, opt);
    var casePad = colToPrefix(col, opt);
    var firstLine = wrapOpen + caseWord('case', opt) + (simple.length ? ' ' + renderInline(simple, opt) : '');
    var lines = [firstLine];
    // align then within branches
    branches.forEach(function (seg) {
      lines.push(innerPad + renderWhenThen(seg, opt));
    });
    if (elsePart) lines.push(innerPad + renderInline(elsePart, opt));
    lines.push(casePad + caseWord('end', opt) + wrapClose);
    // join: first line already positioned by caller at `col`; subsequent lines carry own indent
    return { lines: lines };
  }
  function caseWord(w, opt) { return cased(w, opt, false); }
  function casEWord() {}
  function colToIndent(col, opt) { return Math.floor(col / opt.tabWidth); }
  function colToPrefix(col, opt) { return indentStr(colToIndent(col, opt), opt); }
  function renderWhenThen(seg, opt) {
    // seg = when <cond> then <result>
    var depth = 0, ti = -1;
    for (var i = 0; i < seg.length; i++) {
      var t = seg[i];
      if (t.t === 'punct' && t.v === '(') depth++;
      else if (t.t === 'punct' && t.v === ')') depth--;
      else if (depth === 0 && isWord(t, 'then')) { ti = i; break; }
    }
    if (ti < 0) return renderInline(seg, opt);
    var cond = renderInline(seg.slice(0, ti), opt);
    var res = renderInline(seg.slice(ti + 1), opt);
    return cond + ' ' + caseWord('then', opt) + ' ' + res;
  }

  /* This file continues in part 2 (formatter core) — see appended section. */

  /* ------------------------------------------------------------------ */
  /* PUBLIC: format                                                     */
  /* ------------------------------------------------------------------ */
  // peel leading line/block comments off a statement so they can be emitted above it
  function peelComments(toks) {
    var i = 0, c = [];
    while (i < toks.length && (toks[i].t === 'lc' || toks[i].t === 'bc')) { c.push(toks[i]); i++; }
    return { comments: c, rest: toks.slice(i) };
  }
  function renderComments(toks) {
    return toks.map(function (t) { return String(t.v).replace(/[ \t]+$/g, ''); }).join('\n');
  }
  // extract plain text lines from leading comments (strips --, /*, */, border stars)
  function commentTextLines(comToks) {
    var out = [];
    comToks.forEach(function (t) {
      if (t.t === 'lc') {
        out.push(t.v.replace(/^\s*--+!?\s?/, '').replace(/[ \t]+$/, ''));
      } else {
        var inner = t.v.replace(/^\/\*+/, '').replace(/\*+\/\s*$/, '');
        inner.split('\n').forEach(function (ln) {
          var s = ln.replace(/^[ \t]*\*+[ \t]?/, '').replace(/[ \t]*\*+[ \t]*$/, '').replace(/[ \t]+$/, '');
          if (/^[ \t*]*$/.test(ln)) s = ''; // a pure border / blank line
          out.push(s);
        });
      }
    });
    while (out.length && out[0].trim() === '') out.shift();
    while (out.length && out[out.length - 1].trim() === '') out.pop();
    return out;
  }
  // build a star-banner block:  /***…   * text   ***…/
  function makeBanner(textLines, indent, opt) {
    if (!textLines.length) return '';
    var W = opt.bannerWidth || 69;
    textLines.forEach(function (l) { if (l.length + 4 > W) W = l.length + 4; });
    var ind = indentStr(indent, opt);
    var top = ind + '/' + new Array(W).join('*');           // '/' + (W-1) stars
    var bot = ind + ' ' + new Array(W - 1).join('*') + '/';  // ' ' + (W-2) stars + '/'
    var mid = textLines.map(function (l) { return ind + ' * ' + l; });
    return [top].concat(mid, [bot]).join('\n');
  }
  function renderLeadComments(comToks, indent, opt) {
    if (opt.bannerComments === false) return renderComments(comToks);
    var lines = commentTextLines(comToks);
    return lines.length ? makeBanner(lines, indent, opt) : renderComments(comToks);
  }
  // split "create [or replace] ... as <query>" into the DDL head and the query
  function splitCreateAs(toks) {
    var depth = 0;
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (t.t === 'punct' && t.v === '(') depth++;
      else if (t.t === 'punct' && t.v === ')') depth--;
      else if (depth === 0 && isWord(t, 'as')) {
        var nx = toks[i + 1], nv = nx ? kwv(nx) : null;
        if (nv === 'select' || nv === 'with' || (nx && nx.t === 'punct' && nx.v === '(')) return { head: toks.slice(0, i + 1), query: toks.slice(i + 1) };
      }
    }
    return null;
  }
  function format(sql, options) {
    var opt = {}; for (var k in DEFAULTS) opt[k] = DEFAULTS[k];
    if (options) for (var k2 in options) opt[k2] = options[k2];
    if (opt.riverWidth % opt.tabWidth !== 0) opt.riverWidth = Math.ceil(opt.riverWidth / opt.tabWidth) * opt.tabWidth;

    var toks = compact(tokenize(sql));
    var statements = splitStatements(toks);
    var out = [];
    statements.forEach(function (st) {
      if (st.kind === 'blank') return;
      if (st.kind === 'comment') { out.push(renderLeadComments(st.toks, 0, opt)); return; }
      if (st.kind === 'raw') { out.push(rawJoin(st.toks)); return; }       // standalone GO
      var lead = peelComments(st.toks);                                    // keep banner comments
      var rest = lead.rest, semi = st.semicolon ? ';' : '', body;
      var verb = leadVerb(rest);
      if (!rest.length) body = '';
      else if (verb === 'select' || verb === 'with' || verb === 'insert' || verb === 'update' || verb === 'delete' || verb === 'subselect') {
        try { body = formatStatement(rest, 0, opt); } catch (e) { body = rawJoin(rest); }
      } else if (verb === 'create' || verb === 'replace') {                // CTAS: format the embedded query
        var ca = splitCreateAs(rest), q;
        if (ca) { try { q = formatStatement(ca.query, 0, opt); } catch (e2) { q = rawJoin(ca.query); } body = renderInline(ca.head, opt) + '\n' + q; }
        else body = rawJoin(rest);
      } else body = rawJoin(rest);                                         // declare/exec/begin…end/etc — pass through
      var piece = (lead.comments.length ? renderLeadComments(lead.comments, 0, opt) + '\n' : '') + body + semi;
      if (piece.replace(/\s/g, '')) out.push(piece);
    });
    return out.join('\n\n').replace(/[ \t]+$/gm, '') + '\n';
  }

  // exposed for the formatter core appended below
  var API = {
    format: format, tokenize: tokenize, compact: compact, renderInline: renderInline,
    splitTop: splitTop, splitCommas: splitCommas, splitAndOr: splitAndOr, splitAlias: splitAlias,
    isWord: isWord, kwv: kwv, applyCase: applyCase, cased: cased, pad: pad, indentStr: indentStr,
    vlen: vlen, nextTab: nextTab, hasTopCase: hasTopCase, countWhen: countWhen,
    renderCaseMultiline: renderCaseMultiline, KW: KW, CLAUSE: CLAUSE, JOINWORDS: JOINWORDS, FUNCS: FUNCS,
    DEFAULTS: DEFAULTS
  };

  /* ---- statement splitting (top-level ; and standalone GO) -------- */
  function splitStatements(toks) {
    var sts = [], cur = [], depth = 0;
    function flush(semi) {
      if (cur.length) sts.push(makeStatement(cur, semi));
      cur = [];
    }
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (t.t === 'punct' && t.v === '(') depth++;
      else if (t.t === 'punct' && t.v === ')') depth = Math.max(0, depth - 1);
      if (depth === 0 && t.t === 'punct' && t.v === ';') { flush(true); continue; }
      if (depth === 0 && isWord(t, 'go') && (cur.length === 0 || true)) {
        // treat standalone GO as its own statement boundary
        var prevSig = cur.length ? cur[cur.length - 1] : null;
        var nextSig = toks[i + 1];
        var alone = (!prevSig) && true;
        // GO is a batch separator only when on its own; approximate: flush then emit GO verbatim
        flush(false);
        sts.push({ kind: 'raw', toks: [t], semicolon: false, text: 'go' });
        continue;
      }
      cur.push(t);
    }
    flush(false);
    return sts;
  }
  function makeStatement(toks, semi) {
    // strip leading comments into their own pseudo-statements? keep attached.
    var onlyComments = toks.every(function (t) { return t.t === 'lc' || t.t === 'bc'; });
    if (onlyComments) return { kind: 'comment', toks: toks, semicolon: false };
    return { kind: 'stmt', toks: toks, semicolon: semi };
  }
  function leadVerb(toks) {
    var i = 0;
    while (i < toks.length && (toks[i].t === 'lc' || toks[i].t === 'bc')) i++;
    var t = toks[i];
    if (!t) return null;
    if (t.t === 'punct' && t.v === '(') return 'subselect';
    var v = kwv(t);
    if (v === 'select' || v === 'with' || v === 'insert' || v === 'update' || v === 'delete') return v;
    return v;
  }
  function verbatim(st) {
    // reconstruct from tokens with original-ish spacing (best effort, single spaces)
    return rawJoin(st.toks);
  }
  function rawJoin(toks) {
    // keep procedural code readable without deep reflow: join tokens with minimal spacing,
    // preserving line comments on their own lines.
    var s = '';
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i], prev = toks[i - 1];
      if (t.t === 'lc') { s = s.replace(/[ \t]+$/, ''); s += (s && !/\n$/.test(s) ? ' ' : '') + t.v + '\n'; continue; }
      if (t.t === 'bc') { s += (s && !/\s$/.test(s) ? '\n' : '') + t.v + '\n'; continue; }
      var noSp = s === '' || /\n$/.test(s) ||
        (t.t === 'punct' && (t.v === ',' || t.v === ')' || t.v === '.' || t.v === ';')) ||
        (prev && prev.t === 'punct' && (prev.v === '.' || prev.v === '(')) ||
        (t.t === 'punct' && t.v === '(' && prev && (prev.t === 'word' || prev.t === 'id' || (prev.t === 'punct' && prev.v === ')')));
      if (!noSp) s += ' ';
      s += (t.t === 'word' ? t.v : t.v);
    }
    return s.replace(/[ \t]+$/gm, '').trim();
  }

  // placeholder; real implementation injected by core file via API.formatStatement
  var formatStatement = function () { throw new Error('core-not-loaded'); };
  API.setFormatStatement = function (fn) { formatStatement = fn; };

  // load the core (same file, appended) — define here so closure shares scope
  installCore(API);
  // re-grab the installed implementation
  formatStatement = API.formatStatement;

  return API;

  /* ================================================================== */
  /* CORE FORMATTER (kept in same closure for shared helpers)           */
  /* ================================================================== */
  function installCore(A) {
    var isWord = A.isWord, renderInline = A.renderInline, splitCommas = A.splitCommas,
      splitAndOr = A.splitAndOr, splitAlias = A.splitAlias, indentStr = A.indentStr,
      pad = A.pad, vlen = A.vlen, nextTab = A.nextTab, cased = A.cased, kwv = A.kwv,
      hasTopCase = A.hasTopCase, countWhen = A.countWhen, renderCaseMultiline = A.renderCaseMultiline,
      KW = A.KW, JOINWORDS = A.JOINWORDS, FUNCS = A.FUNCS;

    function kw(word, opt) { return cased(word, opt, false); }

    // river column for a statement at `indent`
    function riverCol(indent, opt) { return indent * opt.tabWidth + opt.riverWidth; }

    // emit "<indent><keyword><pad to river><operand>"
    function riverLine(indent, keyword, operand, opt) {
      var ind = indentStr(indent, opt);
      var startCol = indent * opt.tabWidth + displayLen(keyword, opt);
      var p = pad(startCol, riverCol(indent, opt), opt);
      return ind + keyword + p + operand;
    }
    function displayLen(s, opt) { return vlen(s, 0, opt.tabWidth); }

    // continuation comma line: indent to river, then ",item"
    function commaLine(indent, body, opt) {
      var ind = indentStr(indent, opt);
      var p = pad(indent * opt.tabWidth, riverCol(indent, opt), opt);
      return ind + p + body;
    }
    // river helpers with an explicit river width (used by OVER mini-blocks)
    function riverColW(indent, opt, rw) { return indent * opt.tabWidth + rw; }
    function riverLineW(indent, keyword, operand, opt, rw) {
      var startCol = indent * opt.tabWidth + displayLen(keyword, opt);
      return indentStr(indent, opt) + keyword + pad(startCol, riverColW(indent, opt, rw), opt) + operand;
    }
    function commaLineW(indent, body, opt, rw) {
      return indentStr(indent, opt) + pad(indent * opt.tabWidth, riverColW(indent, opt, rw), opt) + body;
    }
    // gap before a trailing alias on a multiline item's last line: align to the
    // alias river when one is in effect, else a single tab.
    function aliasGap(lineStr, aliasCol, opt) {
      if (aliasCol && aliasCol > 0) return pad(vlen(lineStr, 0, opt.tabWidth), aliasCol, opt);
      return opt.useTabs ? '\t' : ' ';
    }
    function hasTopOver(toks) {
      var depth = 0;
      for (var i = 0; i < toks.length; i++) {
        var t = toks[i];
        if (t.t === 'punct' && t.v === '(') depth++;
        else if (t.t === 'punct' && t.v === ')') depth--;
        else if (depth === 0 && isWord(t, 'over')) return i;
      }
      return -1;
    }
    function splitWindow(win) {
      var part = [], ord = [], frame = [], mode = 'pre', depth = 0;
      for (var i = 0; i < win.length; i++) {
        var t = win[i], v = kwv(t);
        if (t.t === 'punct' && t.v === '(') { depth++; }
        else if (t.t === 'punct' && t.v === ')') { depth--; }
        if (depth === 0 && v === 'partition' && isWord(win[i + 1], 'by')) { mode = 'part'; i++; continue; }
        if (depth === 0 && v === 'order' && isWord(win[i + 1], 'by')) { mode = 'ord'; i++; continue; }
        if (depth === 0 && (v === 'rows' || v === 'range')) { mode = 'frame'; }
        if (mode === 'part') part.push(t); else if (mode === 'ord') ord.push(t); else if (mode === 'frame') frame.push(t);
      }
      return { part: part, ord: ord, frame: frame };
    }
    // render "<prefix>func() over ( partition by.. order by.. )  alias" exploded
    function renderOverItem(p, indent, idx, opt, firstKeyword, aliasCol) {
      var oi = hasTopOver(p.expr);
      var funcPart = p.expr.slice(0, oi);
      var afterOver = p.expr.slice(oi + 1);
      var m = matchedInner(afterOver);
      if (!m) { // fall back to inline
        return null;
      }
      var w = splitWindow(m.inner);
      var river = riverCol(indent, opt);
      var innerLevel = Math.floor(river / opt.tabWidth) + 1;
      var RW = 16; // 'partition by' is 12 chars -> operand lands at +16
      var firstBody = (idx === 0 ? '' : ',') + renderInline(funcPart, opt) + ' ' + kw('over', opt) + ' (';
      var lines = [(idx === 0 && firstKeyword) ? riverLine(indent, firstKeyword, firstBody, opt) : commaLine(indent, firstBody, opt)];
      function mini(keyword, body) {
        var items = splitCommas(body);
        items.forEach(function (it, ix) {
          var s = renderInline(stripLeading(it), opt);
          if (ix === 0) lines.push(riverLineW(innerLevel, keyword, s, opt, RW));
          else lines.push(commaLineW(innerLevel, ',' + s, opt, RW));
        });
      }
      if (w.part.length) mini(kw('partition by', opt), w.part);
      if (w.ord.length) mini(kw('order by', opt), w.ord);
      if (w.frame.length) lines.push(indentStr(innerLevel, opt) + renderInline(w.frame, opt));
      var last = lines[lines.length - 1] + ')';
      if (p.alias) last += aliasGap(last, aliasCol, opt) + p.alias;
      lines[lines.length - 1] = last;
      return lines;
    }

    /* ---- split a query body into ordered clauses -------------------- */
    var CLAUSE_STARTERS = {
      select: 1, from: 1, where: 1, group: 1, having: 1, order: 1, union: 1,
      qualify: 1, limit: 1, window: 1
    };
    function isJoinStart(toks, i) {
      var v = kwv(toks[i]);
      return v === 'join' || v === 'inner' || v === 'left' || v === 'right' || v === 'full' || v === 'cross';
    }

    function splitClauses(toks, opt) {
      var clauses = [], cur = null, depth = 0, caseDepth = 0;
      function push() { if (cur) clauses.push(cur); }
      for (var i = 0; i < toks.length; i++) {
        var t = toks[i], v = kwv(t);
        if (t.t === 'punct' && t.v === '(') depth++;
        else if (t.t === 'punct' && t.v === ')') depth--;
        else if (isWord(t, 'case')) caseDepth++;
        else if (isWord(t, 'end') && caseDepth > 0) caseDepth--;

        if (depth === 0 && caseDepth === 0 && t.t === 'word') {
          if (isJoinStart(toks, i)) {
            // gather the full join keyword sequence + its ON
            push(); cur = { type: 'join', head: [], on: null, kwtoks: [] };
            // collect join keywords until table starts
            var jk = [];
            while (i < toks.length && (kwv(toks[i]) === 'inner' || kwv(toks[i]) === 'left' || kwv(toks[i]) === 'right' || kwv(toks[i]) === 'full' || kwv(toks[i]) === 'outer' || kwv(toks[i]) === 'cross' || kwv(toks[i]) === 'join')) { jk.push(toks[i]); i++; }
            cur.kwtoks = jk;
            // collect table ref until ON / next clause / next join / end
            var body = [];
            while (i < toks.length) {
              var tv = kwv(toks[i]);
              if (toks[i].t === 'punct' && toks[i].v === '(') { depth++; }
              if (toks[i].t === 'punct' && toks[i].v === ')') { depth--; }
              if (depth === 0 && (tv === 'on' || isJoinStart(toks, i) || CLAUSE_STARTERS[tv] || tv === 'using')) break;
              body.push(toks[i]); i++;
            }
            cur.head = body;
            if (i < toks.length && kwv(toks[i]) === 'on') {
              i++; var on = [];
              while (i < toks.length) {
                var tv2 = kwv(toks[i]);
                if (toks[i].t === 'punct' && toks[i].v === '(') depth++;
                if (toks[i].t === 'punct' && toks[i].v === ')') depth--;
                if (depth === 0 && (isJoinStart(toks, i) || CLAUSE_STARTERS[tv2])) break;
                on.push(toks[i]); i++;
              }
              cur.on = on;
            } else if (i < toks.length && kwv(toks[i]) === 'using') {
              var us = [toks[i]]; i++;
              while (i < toks.length && !(toks[i].t === 'punct' && toks[i].v === ')')) { us.push(toks[i]); i++; }
              if (i < toks.length) { us.push(toks[i]); }
              cur.on = us; cur.usingForm = true;
            }
            i--; push(); cur = null; continue;
          }
          if (depth === 0 && caseDepth === 0 && CLAUSE_STARTERS[v]) {
            push();
            var name = v;
            var kwt = [t];
            // multiword: group by / order by / union all
            if ((v === 'group' || v === 'order') && isWord(toks[i + 1], 'by')) { kwt.push(toks[i + 1]); i++; }
            if (v === 'union' && isWord(toks[i + 1], 'all')) { kwt.push(toks[i + 1]); i++; }
            cur = { type: name, kwtoks: kwt, body: [] };
            continue;
          }
        }
        if (!cur) cur = { type: 'pre', body: [] };
        if (!cur.body) cur.body = [];
        cur.body.push(t);
      }
      push();
      return clauses;
    }

    /* ---- render a select-list (with alias alignment) ---------------- */
    function renderSelectList(items, indent, opt, firstKeyword) {
      // items: array of token arrays (already comma-split)
      var river = riverCol(indent, opt);
      var parsed = items.map(function (it) { return splitAlias(stripLeading(it)); });
      // decide which items are multiline (top-level case / long over)
      var info = parsed.map(function (p, idx) {
        var multiCase = opt.caseMultiline && hasTopCase(p.expr) && (countWhen(p.expr) >= 1) && isBareCase(p.expr);
        var oi = opt.overMultiline ? hasTopOver(p.expr) : -1;
        var inlineLen = vlen(renderInline(p.expr, opt), 0, opt.tabWidth);
        var multiOver = oi >= 0 && inlineLen > 48;
        var kind = multiCase ? 'case' : (multiOver ? 'over' : null);
        return { p: p, multiline: !!kind, kind: kind, idx: idx };
      });
      // alias alignment across single-line items. Outliers (very long expressions,
      // e.g. a sum(case..)) are excluded so they don't drag the alias column out;
      // they simply get a single-tab gap before their alias.
      var maxEnd = 0, capCol = river + 60;
      info.forEach(function (n, idx) {
        if (n.multiline) return;
        var lead = idx === 0 ? '' : ',';
        var exprStr = lead + renderInline(n.p.expr, opt);
        n.exprStr = exprStr;
        if (n.p.alias) { var end = river + vlen(exprStr, river, opt.tabWidth); if (end <= capCol && end > maxEnd) maxEnd = end; }
      });
      var aliasCol;
      if (!opt.alignAliases) aliasCol = 0;                       // toggle off -> single space before alias
      else if (opt.aliasColumn && opt.aliasColumn > 0)           // user-pinned alias river
        aliasCol = opt.useTabs ? Math.ceil(opt.aliasColumn / opt.tabWidth) * opt.tabWidth : opt.aliasColumn;
      else aliasCol = maxEnd ? nextTab(maxEnd, opt.tabWidth) : 0; // auto-fit

      var lines = [];
      info.forEach(function (n, idx) {
        if (n.multiline) {
          var ml = n.kind === 'over' ? renderOverItem(n.p, indent, idx, opt, firstKeyword, aliasCol)
            : renderMultilineItem(n.p, indent, idx, opt, firstKeyword, aliasCol);
          if (ml) { lines.push.apply(lines, ml); return; }
        }
        var body = n.exprStr != null ? n.exprStr : ((idx === 0 ? '' : ',') + renderInline(n.p.expr, opt));
        if (n.p.alias && aliasCol) {
          var endCol = river + vlen(body, river, opt.tabWidth);
          body += pad(endCol, aliasCol, opt) + n.p.alias;
        } else if (n.p.alias) {
          body += ' ' + n.p.alias;
        }
        if (idx === 0 && firstKeyword) lines.push(riverLine(indent, firstKeyword, body, opt));
        else lines.push(commaLine(indent, body, opt));
      });
      return lines;
    }
    function isBareCase(toks) {
      var b = toks;
      if (b[0] && b[0].t === 'punct' && b[0].v === '(' && b[b.length - 1] && b[b.length - 1].t === 'punct' && b[b.length - 1].v === ')') b = b.slice(1, b.length - 1);
      return isWord(b[0], 'case');
    }
    function stripLeading(toks) {
      var i = 0; while (i < toks.length && (toks[i].t === 'lc' || toks[i].t === 'bc')) i++;
      return toks.slice(i);
    }
    function renderMultilineItem(p, indent, idx, opt, firstKeyword, aliasCol) {
      var river = riverCol(indent, opt);
      var caseIndent = Math.floor(river / opt.tabWidth);
      var r = renderCaseMultiline(p.expr, river, opt);
      var lines = r.lines.slice();
      // first line gets keyword/comma prefix
      var head = lines[0];
      var prefixBody = (idx === 0 ? '' : ',') + head;
      var first = (idx === 0 && firstKeyword) ? riverLine(indent, firstKeyword, prefixBody, opt) : commaLine(indent, prefixBody, opt);
      var outLines = [first];
      for (var i = 1; i < lines.length - 1; i++) outLines.push(lines[i]);
      // last line "end)" + alias, aligned to the alias river
      var lastRaw = lines[lines.length - 1];
      if (p.alias) lastRaw += aliasGap(lastRaw, aliasCol, opt) + p.alias;
      outLines.push(lastRaw);
      return outLines;
    }

    /* ---- render where / on predicates ------------------------------- */
    // split a predicate at its first top-level comparison operator
    function splitComparison(ptoks) {
      var depth = 0, caseDepth = 0;
      for (var i = 0; i < ptoks.length; i++) {
        var t = ptoks[i];
        if (t.t === 'punct' && t.v === '(') depth++;
        else if (t.t === 'punct' && t.v === ')') depth--;
        else if (isWord(t, 'case')) caseDepth++;
        else if (isWord(t, 'end') && caseDepth > 0) caseDepth--;
        else if (depth === 0 && caseDepth === 0) {
          if (t.t === 'op' && /^(=|<>|!=|>=|<=|>|<|<=>)$/.test(t.v)) return { lhs: ptoks.slice(0, i), opToks: [t], rhs: ptoks.slice(i + 1) };
          if (t.t === 'word') {
            var l = t.v.toLowerCase();
            if (l === 'not') { var nx = ptoks[i + 1]; if (nx && nx.t === 'word' && /^(in|like|between)$/.test(nx.v.toLowerCase())) return { lhs: ptoks.slice(0, i), opToks: [t, nx], rhs: ptoks.slice(i + 2) }; }
            if (/^(is|in|like|ilike|rlike|between)$/.test(l)) return { lhs: ptoks.slice(0, i), opToks: [t], rhs: ptoks.slice(i + 1) };
          }
        }
      }
      return null;
    }
    // one predicate line, optionally aligning the comparison operator at `alignCol`
    function predLine(indent, keyword, ptoks, alignCol, opt) {
      if (alignCol && alignCol > 0) {
        var cmp = splitComparison(ptoks);
        if (cmp && cmp.lhs.length && cmp.rhs.length) {
          var head = riverLine(indent, keyword, renderInline(cmp.lhs, opt), opt);
          var endCol = vlen(head, 0, opt.tabWidth);
          return head + pad(endCol, alignCol, opt) + renderInline(cmp.opToks, opt) + ' ' + renderInline(cmp.rhs, opt);
        }
      }
      return riverLine(indent, keyword, renderInline(ptoks, opt), opt);
    }
    function renderPredicates(toks, indent, headKeyword, opt, force11, alignCol) {
      var parts = splitAndOr(stripLeading(toks));
      var lines = [];
      if (force11) {
        lines.push(riverLine(indent, headKeyword, '1=1', opt));
        parts.forEach(function (pt) {
          if (!pt.toks.length) return;
          if (renderInline(pt.toks, opt).replace(/\s/g, '') === '1=1') return; // don't duplicate user-written 1=1
          lines.push(predLine(indent, kw(pt.op || 'and', opt), pt.toks, alignCol, opt));
        });
      } else {
        lines.push(predLine(indent, headKeyword, parts[0].toks, alignCol, opt));
        for (var i = 1; i < parts.length; i++) {
          lines.push(predLine(indent, kw(parts[i].op || 'and', opt), parts[i].toks, alignCol, opt));
        }
      }
      return lines;
    }

    /* ---- the main query renderer ------------------------------------ */
    function renderQuery(toks, indent, opt) {
      var clauses = splitClauses(toks, opt);
      var blocks = [];
      clauses.forEach(function (c) {
        if (c.type === 'pre') {
          var s = renderInline(stripLeading(c.body), opt).trim();
          if (s) blocks.push({ kind: 'pre', text: indentStr(indent, opt) + s });
          return;
        }
        if (c.type === 'select') {
          var kwtoks = c.kwtoks, kwStr = kw('select', opt);
          var rest = c.body;
          // handle DISTINCT / TOP n
          var lead = [];
          while (rest.length && (kwv(rest[0]) === 'distinct' || kwv(rest[0]) === 'top')) {
            lead.push(kw(rest[0].v.toLowerCase(), opt));
            rest = rest.slice(1);
            if (lead[lead.length - 1] === 'top' && rest.length) { lead.push(renderInline([rest[0]], opt)); rest = rest.slice(1); }
          }
          var firstKw = kwStr + (lead.length ? ' ' + lead.join(' ') : '');
          var items = splitCommas(rest);
          var lines = renderSelectList(items, indent, opt, firstKw);
          blocks.push({ kind: 'select', lines: lines });
          return;
        }
        if (c.type === 'from') {
          var items2 = splitCommas(c.body);
          var lines2 = [];
          items2.forEach(function (it, idx) {
            var s = renderInline(stripLeading(it), opt);
            if (idx === 0) lines2.push(riverLine(indent, kw('from', opt), s, opt));
            else lines2.push(commaLine(indent, ',' + s, opt));
          });
          blocks.push({ kind: 'from', lines: lines2 });
          return;
        }
        if (c.type === 'join') {
          var jwords = c.kwtoks.map(function (t) { return kw(t.v.toLowerCase(), opt); }).join(' ');
          var headStr = renderInline(stripLeading(c.head), opt);
          var jl = [riverLine(indent, jwords, headStr, opt)];
          if (c.on && !c.usingForm) {
            jl.push.apply(jl, renderPredicates(c.on, indent, kw('on', opt), opt, false, opt.joinColumn));
          } else if (c.on && c.usingForm) {
            jl.push(riverLine(indent, kw('using', opt), renderInline(c.on.slice(1), opt), opt));
          }
          blocks.push({ kind: 'join', lines: jl });
          return;
        }
        if (c.type === 'where') {
          var lines3 = renderPredicates(c.body, indent, kw('where', opt), opt, opt.where11, opt.filterColumn);
          blocks.push({ kind: 'where', lines: lines3 });
          return;
        }
        if (c.type === 'having') {
          var lines4 = renderPredicates(c.body, indent, kw('having', opt), opt, false, opt.filterColumn);
          blocks.push({ kind: 'having', lines: lines4 });
          return;
        }
        if (c.type === 'group' || c.type === 'order') {
          var kwStr2 = c.kwtoks.map(function (t) { return kw(t.v.toLowerCase(), opt); }).join(' ');
          var items3 = splitCommas(c.body);
          var lines5 = [];
          items3.forEach(function (it, idx) {
            var s = renderInline(stripLeading(it), opt);
            if (idx === 0) lines5.push(riverLine(indent, kwStr2, s, opt));
            else lines5.push(commaLine(indent, ',' + s, opt));
          });
          blocks.push({ kind: c.type, lines: lines5 });
          return;
        }
        if (c.type === 'union') {
          var kwStr3 = c.kwtoks.map(function (t) { return kw(t.v.toLowerCase(), opt); }).join(' ');
          blocks.push({ kind: 'union', lines: [indentStr(indent, opt) + kwStr3] });
          return;
        }
        // fallback clause
        var kwStr4 = c.kwtoks ? c.kwtoks.map(function (t) { return kw(t.v.toLowerCase(), opt); }).join(' ') : c.type;
        blocks.push({ kind: c.type, lines: [riverLine(indent, kwStr4, renderInline(stripLeading(c.body || []), opt), opt)] });
      });

      // join blocks with blank lines between major ones
      var out = [];
      blocks.forEach(function (b, idx) {
        if (idx > 0 && opt.blankBetweenClauses && needBlankBefore(blocks[idx - 1], b)) out.push('');
        out.push.apply(out, b.lines || [b.text]);
      });
      return out.join('\n');
    }
    function needBlankBefore(prev, cur) {
      if (cur.kind === 'from' || cur.kind === 'join' || cur.kind === 'where' ||
        cur.kind === 'group' || cur.kind === 'having' || cur.kind === 'order' || cur.kind === 'union') return true;
      return false;
    }

    /* ---- statement-level: CTE / insert / update / delete / select --- */
    function formatStatement(toks, indent, opt) {
      toks = stripLeading(toks);
      var lead = leadingComments(arguments.length > 3 ? arguments[3] : null);
      var verb = kvv(toks);
      if (verb === 'with') return formatCTE(toks, indent, opt);
      if (verb === 'insert') return formatInsert(toks, indent, opt);
      if (verb === 'update') return formatUpdate(toks, indent, opt);
      if (verb === 'delete') return formatDelete(toks, indent, opt);
      // subselect wrapped in parens
      if (toks[0] && toks[0].t === 'punct' && toks[0].v === '(') {
        // strip one layer and format inner, keep parens
        var inner = matchedInner(toks);
        if (inner) {
          var body = renderQuery(inner.inner, indent + 1, opt);
          return indentStr(indent, opt) + '(\n' + body + ')';
        }
      }
      return renderQuery(toks, indent, opt);
    }
    function kvv(toks) { var i = 0; while (i < toks.length && (toks[i].t === 'lc' || toks[i].t === 'bc')) i++; return toks[i] ? kwv(toks[i]) : null; }
    function leadingComments() { return ''; }

    function matchedInner(toks) {
      if (!(toks[0].t === 'punct' && toks[0].v === '(')) return null;
      var depth = 0;
      for (var i = 0; i < toks.length; i++) {
        if (toks[i].t === 'punct' && toks[i].v === '(') depth++;
        else if (toks[i].t === 'punct' && toks[i].v === ')') { depth--; if (depth === 0) { return { inner: toks.slice(1, i), rest: toks.slice(i + 1) }; } }
      }
      return null;
    }

    function formatCTE(toks, indent, opt) {
      // with name as ( query ) [, name2 as (...)] mainStatement
      var i = 1; // skip with
      var parts = [];
      var out = [];
      while (true) {
        // optional comma between CTEs
        if (toks[i] && toks[i].t === 'punct' && toks[i].v === ',') i++;
        var nameTok = toks[i];
        if (!nameTok) break;
        var name = nameTok.v; i++;
        // optional column list (col, col)
        var colList = null;
        if (toks[i] && toks[i].t === 'punct' && toks[i].v === '(') {
          var m0 = matchedInner(toks.slice(i)); if (m0) { colList = m0.inner; i += (m0.inner.length + 2); }
        }
        if (kwv(toks[i]) === 'as') i++;
        if (!(toks[i] && toks[i].t === 'punct' && toks[i].v === '(')) break;
        var m = matchedInner(toks.slice(i));
        if (!m) break;
        var innerQ = m.inner;
        var consumed = innerQ.length + 2;
        i += consumed;
        // emit "with name as ("
        var header = indentStr(indent, opt) + (out.length ? '' : kw('with', opt) + ' ');
        if (out.length) header = indentStr(indent, opt) + ', ' + name + ' ' + kw('as', opt) + ' (';
        else header = indentStr(indent, opt) + kw('with', opt) + ' ' + name + (colList ? ' (' + renderInline(colList, opt) + ')' : '') + ' ' + kw('as', opt) + ' (';
        var innerBody = renderQuery(innerQ, indent + 1, opt);
        out.push(header + '\n' + innerBody + ')');
        // continue if another CTE follows
        if (toks[i] && toks[i].t === 'punct' && toks[i].v === ',') continue;
        break;
      }
      var rest = toks.slice(i);
      var restStr = rest.length ? formatStatement(rest, indent, opt) : '';
      return out.join('\n') + (restStr ? '\n\n' + restStr : '');
    }

    function formatInsert(toks, indent, opt) {
      // insert into <table> [ (cols) ] (select.. | values.. | default values)
      var i = 1;
      var hwords = ['insert'];                                  // preserve into | overwrite [table]
      while (i < toks.length) {
        var hv = kwv(toks[i]);
        if (hv === 'into' || hv === 'overwrite' || hv === 'table') { hwords.push(hv); i++; } else break;
      }
      var headKw = hwords.map(function (h) { return kw(h, opt); }).join(' ');
      // table ref = tokens until '(' or select/values/with/default
      var table = [];
      while (i < toks.length) {
        var v = kwv(toks[i]);
        if (toks[i].t === 'punct' && toks[i].v === '(') break;
        if (v === 'select' || v === 'values' || v === 'with' || v === 'default') break;
        table.push(toks[i]); i++;
      }
      var tableStr = renderInline(table, opt);
      var startCol = indent * opt.tabWidth + vlen(headKw, 0, opt.tabWidth);
      var line = indentStr(indent, opt) + headKw + pad(startCol, riverCol(indent, opt), opt) + tableStr;
      var out = [];
      // column list
      if (toks[i] && toks[i].t === 'punct' && toks[i].v === '(') {
        var m = matchedInner(toks.slice(i));
        if (m) {
          var cols = splitCommas(m.inner);
          line += ' (';
          out.push(line);
          cols.forEach(function (cc, idx) {
            var s = renderInline(stripLeading(cc), opt);
            var pre = indentStr(indent + 1, opt) + (idx === 0 ? '' : ',') + s;
            if (idx === cols.length - 1) pre += ')';
            out.push(pre);
          });
          i += (m.inner.length + 2);
        }
      } else {
        out.push(line);
      }
      var rest = toks.slice(i);
      var rv = kwv(rest[0]);
      var restStr;
      if (rv === 'select') restStr = renderQuery(rest, indent, opt);
      else if (rv === 'with') restStr = formatCTE(rest, indent, opt);
      else if (rv === 'values') restStr = formatValues(rest, indent, opt);
      else restStr = renderInline(rest, opt) ? indentStr(indent, opt) + renderInline(rest, opt) : '';
      return out.join('\n') + (restStr ? '\n' + restStr : '');
    }
    function formatValues(toks, indent, opt) {
      // values (..),(..)
      var rows = [];
      var i = 1;
      var depth = 0, cur = [];
      var rest = toks.slice(1);
      var groups = A.splitTop(rest, function (t) { return false; });
      // simple: render inline
      return riverLine0(indent, kw('values', opt), renderInline(rest, opt), opt);
    }
    function riverLine0(indent, keyword, operand, opt) {
      var startCol = indent * opt.tabWidth + vlen(keyword, 0, opt.tabWidth);
      return indentStr(indent, opt) + keyword + pad(startCol, riverCol(indent, opt), opt) + operand;
    }

    function formatUpdate(toks, indent, opt) {
      // update <target> set a=.., b=.. from .. join .. where ..
      var i = 1;
      var target = [];
      while (i < toks.length && kwv(toks[i]) !== 'set') { target.push(toks[i]); i++; }
      var out = [riverLine0(indent, kw('update', opt), renderInline(target, opt), opt)];
      if (kwv(toks[i]) === 'set') {
        i++;
        // collect set body until from/where/; end
        var setBody = [];
        var depth = 0;
        while (i < toks.length) {
          var v = kwv(toks[i]);
          if (toks[i].t === 'punct' && toks[i].v === '(') depth++;
          if (toks[i].t === 'punct' && toks[i].v === ')') depth--;
          if (depth === 0 && (v === 'from' || v === 'where' || v === 'output')) break;
          setBody.push(toks[i]); i++;
        }
        out.push.apply(out, renderSetList(setBody, indent, opt));
      }
      var rest = toks.slice(i);
      if (rest.length) {
        var tail = renderQuery(rest, indent, opt);
        out.push(''); out.push(tail);
      }
      return out.join('\n');
    }
    function renderSetList(toks, indent, opt) {
      var items = splitCommas(toks);
      var river = riverCol(indent, opt);
      // split each into lhs = rhs, align '='
      var rows = items.map(function (it) {
        var s = stripLeading(it);
        var eq = -1, depth = 0;
        for (var k = 0; k < s.length; k++) { if (s[k].t === 'punct' && s[k].v === '(') depth++; else if (s[k].t === 'punct' && s[k].v === ')') depth--; else if (depth === 0 && s[k].t === 'op' && s[k].v === '=') { eq = k; break; } }
        if (eq < 0) return { lhs: renderInline(s, opt), rhs: null };
        return { lhs: renderInline(s.slice(0, eq), opt), rhs: renderInline(s.slice(eq + 1), opt) };
      });
      var maxLhs = 0;
      rows.forEach(function (r, idx) { var lead = idx === 0 ? '' : ','; var end = river + vlen(lead + r.lhs, river, opt.tabWidth); if (r.rhs !== null && end > maxLhs) maxLhs = end; });
      var eqCol = maxLhs ? nextTab(maxLhs, opt.tabWidth) : 0;
      var lines = [];
      rows.forEach(function (r, idx) {
        var lead = idx === 0 ? '' : ',';
        var body = lead + r.lhs;
        if (r.rhs !== null) {
          var endCol = river + vlen(body, river, opt.tabWidth);
          body += pad(endCol, eqCol, opt) + '= ' + r.rhs;
        }
        if (idx === 0) lines.push(riverLine0(indent, kw('set', opt), body, opt));
        else lines.push(commaLine(indent, body, opt));
      });
      return lines;
    }

    function formatDelete(toks, indent, opt) {
      var rest = toks.slice(1); // drop 'delete'
      var head = indentStr(indent, opt) + kw('delete', opt);
      // optional target before FROM/WHERE: "delete tbl from ..."
      if (rest.length && kwv(rest[0]) !== 'from' && kwv(rest[0]) !== 'where') {
        var tgt = [], j = 0, depth = 0;
        while (j < rest.length) {
          var v = kwv(rest[j]);
          if (rest[j].t === 'punct' && rest[j].v === '(') depth++;
          if (rest[j].t === 'punct' && rest[j].v === ')') depth--;
          if (depth === 0 && (v === 'from' || v === 'where' || v === 'output')) break;
          tgt.push(rest[j]); j++;
        }
        head = riverLine0(indent, kw('delete', opt), renderInline(tgt, opt), opt);
        rest = rest.slice(j);
      }
      var q = rest.length ? renderQuery(rest, indent, opt) : '';
      return q ? head + '\n' + q : head;
    }

    // expose
    A.formatStatement = formatStatement;
    A.renderQuery = renderQuery;
  }
});
