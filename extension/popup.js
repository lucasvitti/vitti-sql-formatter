/* Vitti SQL Formatter — popup: Format tab + Config tab.
 * Config is persisted to chrome.storage.sync ('vittiOpt') and read by the content
 * script, so column spacing applies to in-page formatting too. */
(function () {
  var $ = function (s) { return document.querySelector(s); };
  var inEl = $('#in'), outEl = $('#out');

  function indentInfo() { var v = $('#indent').value; return { useTabs: v.indexOf('tab') === 0, tabWidth: parseInt(v.replace(/[a-z]+/g, ''), 10) || 4 }; }
  function snap(v, useTabs, tw) { v = Math.max(0, Math.round(v || 0)); if (useTabs && v > 0) v = Math.max(tw, Math.round(v / tw) * tw); return v; }
  function num(id) { return parseInt($(id).value, 10) || 0; }

  function readCfg() {
    var ii = indentInfo(), tw = ii.tabWidth, useTabs = ii.useTabs;
    return {
      keywordCase: $('#kwcase').value,
      functionCase: $('#kwcase').value === 'preserve' ? 'preserve' : 'lower',
      useTabs: useTabs, tabWidth: tw,
      riverWidth: snap(num('#r-fields'), useTabs, tw) || (useTabs ? tw * 3 : 12),
      aliasColumn: snap(num('#r-labels'), useTabs, tw),
      joinColumn: snap(num('#r-joins'), useTabs, tw),
      filterColumn: snap(num('#r-filter'), useTabs, tw),
      where11: $('#where11').checked,
      bannerComments: $('#banners').checked,
      alignAliases: $('#aliases').checked,
      blankBetweenClauses: $('#blanks').checked
    };
  }

  function format() {
    var o = readCfg();
    outEl.style.tabSize = o.tabWidth; outEl.style.MozTabSize = o.tabWidth; inEl.style.tabSize = o.tabWidth;
    try { outEl.value = inEl.value.trim() ? window.SQLFmt.format(inEl.value, o) : ''; $('#status').textContent = ''; }
    catch (e) { outEl.value = inEl.value; $('#status').textContent = 'parse error'; }
  }

  function flash() { var s = $('#cfgsaved'); s.textContent = 'saved ✓'; setTimeout(function () { s.textContent = ''; }, 1000); }
  function saveCfg() { try { chrome.storage.sync.set({ vittiOpt: readCfg() }); } catch (e) { } flash(); }

  function applyCfg(c) {
    if (!c) return;
    if (c.keywordCase) $('#kwcase').value = c.keywordCase;
    $('#indent').value = (c.useTabs === false ? 'sp' : 'tab') + (c.tabWidth || 4);
    if (c.riverWidth != null) $('#r-fields').value = c.riverWidth;
    if (c.aliasColumn != null) $('#r-labels').value = c.aliasColumn;
    if (c.joinColumn != null) $('#r-joins').value = c.joinColumn;
    if (c.filterColumn != null) $('#r-filter').value = c.filterColumn;
    $('#where11').checked = c.where11 !== false;
    $('#banners').checked = c.bannerComments !== false;
    $('#aliases').checked = c.alignAliases !== false;
    $('#blanks').checked = c.blankBetweenClauses !== false;
  }

  function resetDefaults() {
    $('#kwcase').value = 'lower'; $('#indent').value = 'tab4';
    $('#r-fields').value = 12; $('#r-labels').value = 0; $('#r-joins').value = 0; $('#r-filter').value = 0;
    $('#where11').checked = true; $('#banners').checked = true; $('#aliases').checked = true; $('#blanks').checked = true;
    saveCfg(); format();
  }

  // tabs
  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
    t.addEventListener('click', function () {
      Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (x) { x.classList.toggle('active', x === t); });
      $('#tab-format').hidden = t.dataset.tab !== 'format';
      $('#tab-config').hidden = t.dataset.tab !== 'config';
    });
  });

  // config: live-reformat on input, persist on change
  ['#kwcase', '#indent', '#r-fields', '#r-labels', '#r-joins', '#r-filter', '#where11', '#banners', '#aliases', '#blanks'].forEach(function (s) {
    var el = $(s);
    el.addEventListener('input', format);
    el.addEventListener('change', function () { saveCfg(); format(); });
  });
  $('#reset').addEventListener('click', resetDefaults);

  // format tab
  inEl.addEventListener('input', format);
  $('#format').addEventListener('click', format);
  $('#paste').addEventListener('click', function () { tryPaste(false); });
  $('#copy').addEventListener('click', async function () {
    if (!outEl.value) return;
    try { await navigator.clipboard.writeText(outEl.value); } catch (e) { outEl.select(); document.execCommand('copy'); }
    $('#status').innerHTML = '<span class="ok">copied ✓</span>'; setTimeout(function () { $('#status').textContent = ''; }, 1200);
  });

  async function tryPaste(silent) {
    try { var t = await navigator.clipboard.readText(); if (t && t.trim()) { inEl.value = t; format(); return; } if (!silent) $('#status').textContent = 'clipboard empty'; }
    catch (e) { if (!silent) $('#status').textContent = 'click Paste clipboard'; }
  }

  // restore saved config, then auto-fill from clipboard
  try { chrome.storage.sync.get('vittiOpt', function (r) { applyCfg(r && r.vittiOpt); format(); tryPaste(true); }); }
  catch (e) { format(); tryPaste(true); }
})();
